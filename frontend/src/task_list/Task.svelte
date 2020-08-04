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

	$collapser_size: 0.6rem;
	$collapser_width: 0.8rem;

	$task_top_padding: 0.13rem;

	$selected_colour: lighten($primary-color, 13%);
	$summary_font_size: 1.02rem;

	ul.task_list > li {
		margin-top: 0.3rem;
	}

	li > ul.task_list {
		padding-left: 3em;
	}

	button.collapser {
		margin: 0;
		padding: 0;
		border: 0;

		float: left;
		width: $collapser_width;
		line-height: 1.5em;
		padding-top: $task_top_padding;

		font-size: $summary_font_size;
		align: center;
		cursor: pointer;

		background: transparent;
	}

	li:not(.collapsed) > button.collapser > div {
		opacity: 0.8;
	}

	button.collapser > div {
		display: inline-block;
		height: $collapser_size;
		width: $collapser_size;
	}

	$task_border_width: 0.2rem;

	div.task {
		padding: $task_top_padding 0;
		margin-left: $collapser_width + 0.2rem;

		border-left: transparent $task_border_width solid;

		max-width: 40rem;
	}

	li.selected > div.task {
		border-left-color: $selected_colour;
	}

	div.task.done .summary:not(.edit) {
		text-decoration: line-through;
	}

	.summary {
		padding: 0.2rem 0;
		padding-left: $task_top_padding * 2;
		margin: 0;

		border: 0;

		width: 100%;

		line-height: 1.1em;
		min-height: 1.6em;
		font-size: $summary_font_size;
	}

	.summary :global(code) {
		line-height: 1.0em;
		padding: 0.05rem $unit-1;
	}

	div.edit {
		white-space: pre-wrap;
	}

	div.edit:focus {
		color: #000;
		border: 0;
		outline: 0;
		box-shadow: none;
	}

	$editing: '[contenteditable="true"]';

	div.edit:not(#{$editing}) {
		display: none;
	}

	div.edit#{$editing} + div.summary {
		display: none;
	}

	.task > div:not(.edit) {
		cursor: default !important;
		user-select: none;
	}

	.exposition {
		margin: 0;
		padding: 0;
		padding-left: ($task_top_padding * 2);
		border: 0;
		width: 100%;
		line-height: 1.2em;
		font-size: 0.75rem;
	}

	.exposition :global(code) {
		line-height: 1.2em;
		padding: 0.05rem $unit-1;
	}

	div.edit#{$editing} + div.exposition {
		display: none;
	}

	:global(div.exposition > p) {
		margin: 0;
	}

	:global(div.exposition > p:not(:first-child)) {
		margin-top: 0.2rem;
	}

	:global(div.exposition ol, div.exposition ul) {
		margin: 0;
		margin-bottom: $unit-2;
		margin-left: $unit-6;
	}

	:global(div.exposition ol:not(:first-child),
			div.exposition ul:not(:first-child)) {
		margin-top: $unit-2;
	}

	:global(div.exposition li) {
		margin: 0;
	}

	:global(div.exposition li:not(:first-child)) {
		margin-top: 0.1rem;
	}
</style>

<script>
	import { createEventDispatcher, tick, afterUpdate } from 'svelte';

	import ContextMenu from '../ContextMenu.svelte';
	import markdown from '../markdown';

	const dispatch = createEventDispatcher();
	export let task;
	export let selection;

	export let is_root_task = false;

	import FaAngleDown from 'svelte-icons/fa/FaAngleDown.svelte';
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte';
	const icon_collapsed = FaAngleRight;
	const icon_expanded = FaAngleDown;

	let task_div_node;
	let summary_node;
	let exposition_node;

	let task_status;

	$: task_status = $task.get_status();

	function are_we_the_only_selected_task() {
		return selection.length == 1 && selection[0] == task;
	}

	function trim_newlines(text) {
		let start, end;

		for (start = 0; start < text.length; start++)
			if (text[start] !== '\n')
				break;

		text = text.slice(start);

		for (end = text.length - 1; end > 0; end--)
			if (text[end] !== '\n')
				break;

		return text.slice(0, end + 1);
	}

	async function start_editing(tgt) {
		if (!are_we_the_only_selected_task()) {
			dispatch('select_task', {
				task: task,
				multiple: false
			});

			await tick();
		}

		if (tgt == exposition_node)
			exposition_node.innerText = trim_newlines(task.exposition);
		else if (tgt == summary_node)
			summary_node.textContent = trim_newlines(task.summary);

		tgt.contentEditable = true;
		document.execCommand('defaultParagraphSeparator', false, 'div');
		cursor_to_end(tgt);
	}

	function done_editing(tgt) {
		tgt.contentEditable = false;
		task.update(t => t._edit_status = false);
		dispatch('persist', task);
	}

	let done_editing_timer = null;

	function handle_blur({ target: tgt }) {
		if (!task._edit_status) {
			tgt.contentEditable = false;
			return;
		}

		setTimeout(() => {
			if (!tgt.isContentEditable)
				return;

			// we skip this if the document has lost focus so that when we
			// regain focus we're still in insert mode. the timeout is
			// important because the document still has focus when we lose it,
			// but after a timer tick then the blur has propagated.
			if (document.hasFocus()) {
				done_editing(tgt);
				return;
			}

			// the second timer is here so that if the user has tabbed away for a
			// long enough time, they don't forget that they're in insert mode,
			// come back to the tab, and start typing a bunch of 'j's and 'k's into
			// a task.
			//
			// this value may be adjusted in the future. 30 seconds seems
			// appropriate, but longer or shorter may make more sense.
			done_editing_timer = setTimeout(() => {
				done_editing_timer = null;
				done_editing(tgt);
			}, 30 * 1000);
		}, 0);
	}

	function handle_collapse_toggle(ev) {
		task.update(t => t.collapsed = !t.collapsed);
		dispatch('persist', task);
		ev.target.blur();
	}

	const scroll_by_pages = false;

	function update_scroll_bounds() {
		let elem = task_div_node;

		if (!elem)
			return;

		let doc_top = window.scrollY;
		let elem_top = elem.offsetTop;

		let top = elem_top - doc_top;
		let btm = doc_top + window.innerHeight - elem_top - elem.offsetHeight;

		if (top < 0 || btm < 0) {
			let mode = (top < btm) ^ scroll_by_pages;
			task_div_node.scrollIntoView(mode);
		}
	}

	$: {
		let _ = selection;

		if (are_we_the_only_selected_task())
			setTimeout(update_scroll_bounds, 0);
	}

	function set_window_sel(r) {
		let s = window.getSelection();
		s.removeAllRanges();
		s.addRange(r);
	}

	function select_all(node) {
		let r = document.createRange();
		const first = node.firstChild;
		const last = node.lastChild;

		r.setStart(first, 0);
		r.setEnd(last, last.textContent.length);

		set_window_sel(r);
	}

	function cursor_to(node, pos) {
		let r = document.createRange();

		r.setStart(node, pos);
		r.setEnd(node, pos);

		set_window_sel(r);
	}

	function cursor_to_start(node) {
		if (node.firstChild)
			cursor_to(node.firstChild, 0);
		else
			cursor_to(node, 0);
	}

	function cursor_to_end(node) {
		const last = node.lastChild;

		if (last)
			cursor_to(last, last.textContent.length);
		else
			cursor_to(node, 0);
	}

	function set_cursor_position(tgt, cursor_position) {
		switch (cursor_position) {
		case 'start':
			cursor_to_start(tgt);
			break;

		case 'end':
			cursor_to_end(tgt);
			break;
		}
	}

	function set_selection(tgt, selection) {
		if (selection == 'all')
			select_all(tgt);
	}

	function dispatch_to_parent(ev) {
		let new_ev = new ev.constructor(ev.type, ev);
		summary_node.parentNode.dispatchEvent(new_ev);
	}

	async function handle_summary_keydown(ev) {
		let tgt = ev.target;

		switch (ev.code) {
		case 'Enter':
			if (ev.ctrlKey || ev.altKey)
				ev.preventDefault();

			done_editing(summary_node);
			return;

		case 'Escape':
			done_editing(summary_node);
			ev.stopPropagation();
			return;

		case 'BracketLeft':
			if (ev.ctrlKey)
				return;
			break;

		case 'Backslash':
		case 'Slash':
			ev.stopPropagation();
			return false;

		case 'ArrowUp':
		case 'ArrowDown':
			if (!ev.ctrlKey)
				break;

			ev.preventDefault();
			ev.stopPropagation();
			dispatch_to_parent(ev);
			return;

		case 'Backspace':
			if (tgt.textContent.length)
				break;

			done_editing(summary_node);
			await tick();

			/* otherwise, fall-through */

		case 'Tab':
			ev.preventDefault();
			ev.stopPropagation();
			dispatch_to_parent(ev);
			return;
		}

		ev.stopPropagation();
	}

	function handle_exposition_keydown(ev) {
		let tgt = ev.target;

		switch (ev.code) {
		case 'Tab':
			ev.preventDefault();
			document.execCommand('insertHTML', false, '&#009');
			return;

		case 'Slash':
			ev.stopPropagation();
			return false;

		case 'Escape':
			break;
		case 'BracketLeft':
			if (ev.ctrlKey)
				break;
			return;

		case 'Backspace':
			ev.stopPropagation();

			if (!tgt.textContent.length)
				done_editing(tgt);
			return;

		case 'Enter':
			if (ev.altKey)
				break;

			if (ev.ctrlKey) {
				ev.stopPropagation();
				ev.preventDefault();

				// we want this ctrl-enter to act like a regular enter when we
				// pass it to the parent. since keyboardevents are immutable,
				// we have to do this whole song and dance.

				let new_ev = new ev.constructor(ev.type, ev);
				Object.defineProperty(new_ev, 'ctrlKey', () => false);
				summary_node.parentNode.dispatchEvent(new_ev);
				return;
			}

		default:
			ev.stopPropagation();
			return;
		}

		ev.stopPropagation();
		ev.preventDefault();
		dispatch_to_parent(ev);
	}

	function cleanup_innertext(node) {
		// with defaultParagraphSeparator == 'div', we end up with additional
		// newlines in innerText for some reason. since this is markdown
		// anyway, we're just going to collapse all runs of two or more
		// newlines down to two, for the paragraph separation.
		//
		// then trim the start and end too because it fucks up the editing on
		// firefox to have trailing newlines.

		return trim_newlines(node.innerText).replace(/\n\n+/g, '\n\n');
	}

	function handle_summary_input(ev) {
		task.update(t => t.summary = summary_node.textContent);
		dispatch('persist', task);
	}

	function handle_exposition_input(ev) {
		task.update(t => t.exposition = cleanup_innertext(exposition_node));
		dispatch('persist', task);
	}

	function edit_summary(extra = {}) {
		let { cursor_position, selection } = extra;

		start_editing(summary_node);

		if (cursor_position !== undefined)
			set_cursor_position(summary_node, cursor_position);

		if (selection !== undefined)
			set_selection(summary_node, selection);
	}

	function edit_exposition() {
		start_editing(exposition_node);
		cursor_to_end(exposition_node);
	}

	let edit_status = false;
	async function apply_edit_status(st) {
		// skip the transition if our component is still being set up
		if (!summary_node || !exposition_node) {
			await tick();

			if (!summary_node || !exposition_node)
				return;
		}

		if (edit_status == st)
			return;

		edit_status = st;
		if (!st)
			return;

		switch (st[0]) {
		case 'summary':
			edit_summary(st[1] || {});
			break;

		case 'exposition':
			edit_exposition();
			break;
		}

		// clear the extra cursor information so that if we refresh our editing
		// status (for example, due to the node being moved), we don't "select
		// all" or whatever again
		st[1] = {};
	}

	$: apply_edit_status($task._edit_status);

	afterUpdate(() => {
		if (!edit_status)
			return;

		if (edit_status[0] == 'summary')
			summary_node.focus();
		else
			exposition_node.focus();
	});

	function handle_window_focus(ev) {
		// see `done_editing()`
		if (done_editing_timer) {
			clearTimeout(done_editing_timer);
			done_editing_timer = null;
		}
	}

	function handle_div_click(ev) {
		if (ev.altKey) {
			dispatch('reroute_to_task', task);
			return;
		}

		dispatch('select_task', {
			task: task,
			multiple: ev.ctrlKey,
			range: ev.shiftKey
		});
	}

	function create_context_menu(ev, on_select, props) {
		let menu = new ContextMenu({
			target: document.body,
			props: {
				top_left: [
					ev.clientX + window.scrollX,
					ev.clientY + window.scrollY
				],
				...props
			}
		});

		menu.$on('item_selected', on_select);

		menu.$on('close', () => {
			menu.$destroy();
		});
	}

	function handle_context_menu(ev) {
		if (ev.altKey || ev.ctrlKey || ev.shiftKey
				|| ev.target.isContentEditable
				|| ev.target.nodeName === 'A')
			return;

		ev.preventDefault();

		const frac = (s) => {
			let st = task_status.get(s);
			return st ? st[0] : 0.0;
		};

		const base_menu_items = [
			{
				display: '<i style="opacity: 0.7;">no status</i>',
				fraction: frac(null),
				val: null
			},
			{
				display: null,
			}
		];

		const statuses = task._workspace.statuses;
		const menu_items = statuses
			.filter(s => !!s.id)
			.map(s => {
				return {
					display: s.display || s.id,
					fraction: frac(s.id),
					val: s.id
				};
			});

		let on_select = ({ detail: status }) => {
			task.update(t => t.set_status(status));
			task.notify_hierarchy();
			dispatch('persist', task);
		};

		create_context_menu(ev, on_select, {
			items: base_menu_items.concat(menu_items),
			display_frac_text: task.has_children()
		});
	}

	function format_status(task) {
		if (!task.has_children()) {
			return task.status ? task.status : 'no status';
		}

		const st = task_status;
		const fmt = (s, title) => {
			const [frac, count] = st.get(s) || [0,0];

			return (title || s) + ': ' + Math.round(frac * 100) + '%';
		};

		const statuses = task._workspace.statuses;

		let disp = [fmt(null, 'no status')].concat(
			statuses.map(({ id: s }) => fmt(s)));

		return disp.join('\n');
	}

	function task_is_done(task) {
		let [id, [frac, _]] = task_status.entries().next().value;
		return id == 'done' && frac === 1.0;
	}
</script>

<svelte:window
	on:focus={handle_window_focus}
	/>

<li class:parent="{$task.has_children()}"
	class:collapsed="{$task.collapsed}"
	class:done="{task_is_done($task)}"
	class:selected="{$task.selected}">
	{#if $task.has_children() && !is_root_task}
		<button class="collapser" on:click={handle_collapse_toggle} tabindex=-1>
			<div>
				<svelte:component
					this={$task.collapsed ? icon_collapsed : icon_expanded}
					/>
			</div>
		</button>
	{/if}

	<div class="task"
		bind:this={task_div_node}
		on:contextmenu={handle_context_menu}
		on:click={handle_div_click}>
		<div class="summary edit"
			bind:this={summary_node}
			on:blur={handle_blur}
			on:keydown={handle_summary_keydown}
			on:input={handle_summary_input}
			contenteditable=false></div>
		<div class="summary"
			 title="{format_status($task)}"
			 on:dblclick={ev => start_editing(summary_node)}>
			{@html markdown.inline($task.summary)}
		</div>

		<div class="exposition edit"
			bind:this={exposition_node}
			on:keydown={handle_exposition_keydown}
			on:blur={handle_blur}
			on:input={handle_exposition_input}
			contenteditable=false></div>
		<div class="exposition"
			on:dblclick={ev => start_editing(exposition_node)}>
			{@html markdown.block($task.exposition || '')}
		</div>
	</div>

	{#if $task.has_children() && (!$task.collapsed || is_root_task)}
		<ul class="task_list">
			{#each $task.children as subtask, i}
				<svelte:self bind:task={subtask}
					on:empty_node
					{selection}
					on:select_task
					on:reroute_to_task
					on:persist
					/>
			{/each}
		</ul>
	{/if}
</li>
