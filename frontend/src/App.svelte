<!--
   windswept: task management for the ambitious
   Copyright (C) 2020 William Light

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU Affero General Public License as published
   by the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Affero General Public License for more details.

   You should have received a copy of the GNU Affero General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<style lang="scss">
	@import "../style/variables";

	.runtime-error {
		padding-top: 2rem;
		padding-left: 2rem;
	}

	main {
		display: flex;
	}

	main > * {
		margin-top: 1rem;
	}

	.loading {
		margin-left: 1.5rem;
		margin-top: 1.2rem;
		width: 1.0rem;
	}

	.loading + div {
		padding-left: 0.5rem;
		font-size: $font-size-sm;
		color: lighten($primary-color, 10%);
	}

	.view_switch {
		position: absolute;
		top: -1px;
		left: 0;

		width: 100%;
		min-width: $size-lg;
		padding: 0 10rem;

		display: flex;
		justify-content: flex-end;

		font-size: $font-size-sm;
		pointer-events: none;
	}

	.view_switch .done-switch {
		margin-top: 0.05rem;
		margin-right: $unit-4;

		color: lighten($body-font-color, 30%);
		pointer-events: auto;
	}

	.view_switch .done-switch input {
		padding-top: $unit-1;
		margin-right: $unit-1;
	}

	.view_switch ul {
		pointer-events: auto;

		width: max-content;
		justify-content: flex-end;
	}

	.view_switch a {
		padding: $unit-1 $unit-3;
	}

	:global(.toasts) > .toast {
		animation: none !important;
		transition: none !important;
	}
</style>

<script>
	import { tick, onMount } from 'svelte';
	import { NotificationDisplay, notifier } from '../vendor/svelte-notifications/src';

	import * as model from './model';

	import TaskList from './task_list/TaskList.svelte';
	import StructureBoard from './board/StructureBoard.svelte';
	import StatusBoard from './board/StatusBoard.svelte';

	let tasks = [];

	let workspace;
	let task;
	let component;

	let have_task = false;

	const title_suffix = "windswept 0.0.20200605";

	const component_friendly_map = {
		list: TaskList,
		plan: StructureBoard,
		status: StatusBoard
	};

	const view_switch_components = [
		'list',
		'plan',
		'status'
	];

	const default_view = 'list';
	let route = {
		path: [],
		view: ''
	};

	async function do_routing() {
		component = component_friendly_map[route.view];

		task = workspace;
		route.path.forEach((p) => {
			if (!task)
				return;

			task = task.children.find((t) => t.summary == p);
		});

		await tick();
		have_task = !!task;

		if (!task)
			document.title = title_suffix;
		else
			document.title = (
				task.summary + ' / ' + route.view + ' / ' + title_suffix);
	}

	async function hash_change_handler() {
		if (window.location.hash.length <= 0)
			return;

		let loc = window.location.hash.replace(/^#*/, '');
		let path = loc.split('/')
			.filter((s) => s.length > 0)
			.map(decodeURIComponent);

		const last = path.last();
		if (last && last.startsWith(':'))
			route.view = path.pop().slice(1);
		else
			route.view = default_view;

		route.path = path;

		have_task = false;
		await tick();

		await do_routing();
		window.scrollTo(0, 0);
	}

	function reroute() {
		const encode = (x) => {
			return encodeURI(x)
				.replace(/[/:]/g,
					(c) => ('%' + c.charCodeAt(0).toString(16)));
		};

		let path = route.path.map(encode);

		if (route.view)
			path.push(':' + encode(route.view));

		console.log(path);
		window.location.hash = '#/' + path.join('/');
	}

	const default_statuses = [
		{ id: 'scheduled' },
		{ id: 'in progress' },
		{ id: 'done' }
	];

	function make_task_tree(raw_json) {
		let wkspc;
		let children;

		const task_tree_recursive = (children, parent) => {
			return children.map((child) => {
				let children = child.children || [];
				delete child.children;

				let t = Object.assign(new model.Task, child);
				t.children = task_tree_recursive(children, t);
				t.parent = parent;

				// FIXME: this is a hack lol
				if (t.status === '')
					t.status = null;

				t._workspace = wkspc;
				return t;
			});
		};

		if (Array.isArray(raw_json)) {
			// construct a default workspace
			wkspc = new model.Workspace('root');
			wkspc.statuses = [...default_statuses];
			children = raw_json;
		} else {
			children = raw_json.children || [];
			delete raw_json.children;

			wkspc = Object.assign(new model.Workspace, raw_json);
		}

		wkspc.children = task_tree_recursive(children, wkspc);
		return wkspc;
	}

	function tasks_to_json(tasks) {
		return JSON.stringify(tasks, (k, v) => {
			if (k.startsWith('_')
					|| v === null
					|| (Array.isArray(v) && !v.length)
					|| v === '')
				return undefined;

			return v;
		});
	}

	let conn = null;
	let loading;

	async function load_workspace(wkspc) {
		have_task = false;
		await tick();

		workspace = wkspc;
		task = workspace;

		await do_routing();
		loading = false;
	}

	function send_sync(msg) {
		if (!conn || conn.readyState != 1)
			return;

		conn.send(msg);
	}

	function connect_to_sync() {
		conn = new WebSocket('ws://' + location.host + '/sync/');

		conn.onopen = (ev) => {
			console.log('sync connection open');
			loading = true;
		};

		conn.onmessage = (ev) => {
			const deser = ev.data.length ? JSON.parse(ev.data) : [];
			load_workspace(make_task_tree(deser));
		};

		conn.onclose = (ev) => {
			console.log('sync connection closed, attempting reconnect...');

			// FIXME: what do we do if the server state has diverged
			// significantly?
			setTimeout(connect_to_sync, 800);
		};
	}

	onMount(() => {
		connect_to_sync();
	});

	function handle_global_keydown(ev) {
		switch (ev.code) {
		case 'BracketLeft':
			if (!ev.ctrlKey)
				break;

			ev.preventDefault();
			document.activeElement.blur();
			break;

		case 'Escape':
			document.activeElement.blur();
			break;

		case 'KeyS':
			if (ev.ctrlKey) {
				console.log('sending backup!');
				notifier.send('saving backup...', 'default', 1500);
				send_sync('~!~' + tasks_to_json(workspace));

				ev.preventDefault();
				ev.stopPropagation();
			}
			break;

		case 'Slash': {
			ev.preventDefault();

			if (ev.ctrlKey)
				route.path = [];
			else if (ev.shiftKey)
				route.path.pop();
			else
				return;

			reroute();
			break;
		}

		case 'Digit1':
		case 'Digit2':
		case 'Digit3':
			if (ev.altKey || ev.ctrlKey || ev.shiftKey)
				return;

			const key_view_map = {
				Digit1: 'list',
				Digit2: 'plan',
				Digit3: 'status'
			};

			route.view = key_view_map[ev.code];
			reroute();
			break;

		case 'Backquote':
			hide_done = !hide_done;
			break;
		}
	}

	function handle_reroute_to_task({ detail: task }) {
		let path = []

		for (; task.parent; task = task.parent)
			path.push(task.summary);

		if (!path.length)
			return;

		path.reverse();
		route.path = path;
		reroute();
	}

	function handle_persist({ detail: task }) {
		send_sync(tasks_to_json(workspace));
	}

	function url_for_view(view) {
		return ('#/' + route.path.concat(':' + view).join('/'));
	}

	let hide_done = false;

	$: {
		if (hide_done)
			document.body.classList.add('hide-done-tasks');
		else
			document.body.classList.remove('hide-done-tasks');
	}

	function handle_hide_done(ev) {
		ev.target.blur();
		hide_done = !hide_done;
		console.log(hide_done);
	}

	if (window.location.hash.length == 0) {
		window.location.hash = '#/';
	}

	hash_change_handler();
</script>

<svelte:window
	on:hashchange={hash_change_handler}
	/>

<svelte:body
	on:keydown={handle_global_keydown}
	/>

<NotificationDisplay />

{#if !conn || conn.readyState != 1 || loading}
	<main class="section container grid-xl">
		<div class="loading"></div>
		<div>
			{#if !conn || conn.readyState == 0}
				establishing backend connection
			{:else if !loading}
				reconnecting
			{:else}
				receiving workspace
			{/if}
		</div>
	</main>
{:else if have_task}
	{#if component}
		<svelte:component
			this={component}
			on:reroute_to_task={handle_reroute_to_task}
			on:persist={handle_persist}
			bind:root_task={task}
			/>
	{:else}
		<h3 class="runtime-error p-centered">404 unknown component/view</h3>
	{/if}

	<div class="view_switch">
		{#if route.view == 'plan'}
			<div class="done-switch">
				<label class="form-switch">
					<input type="checkbox"
						   on:input="{ev => ev.target.blur()}"
						   bind:checked={hide_done}>
						   <i class="form-icon"></i> hide done tasks
				</label>
			</div>
		{/if}
		<ul class="tab">
			{#each view_switch_components as view}
				<li class="tab-item"
					class:active="{route.view == view}">
					<a href="{url_for_view(view)}">
						{view}
					</a>
				</li>
			{/each}
		</ul>
	</div>
{:else}
	<h3 class="runtime-error p-centered">404 no task at that path found</h3>
{/if}
