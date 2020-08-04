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
	@import './style.scss';
</style>

<script>
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	import { dnd } from '../dnd';
	import markdown from '../markdown';

	import FaAngleLeft from 'svelte-icons/fa/FaAngleLeft.svelte';
	import FaAngleRight from 'svelte-icons/fa/FaAngleRight.svelte';
	const icon_collapsed = FaAngleRight;
	const icon_expanded = FaAngleLeft;

	export let root_task;

	let container;
	let panels = [];

	let columns;

	function add_leaves(underneath) {
		underneath.children.forEach((task) => {
			if (!task.has_children()) {
				let status = task.status;

				if (!columns.has(status))
					columns.set(status, [task]);
				else
					columns.get(status).push(task);
			} else
				add_leaves(task);
		});
	}

	let status_collapsed = {};

	$: {
		columns = new Map();

		const null_status = {
			id: null,
			collapsed: true
		};

		const statuses = [null_status].concat(
			root_task._workspace.statuses);

		for (let status of statuses) {
			columns.set(status.id, []);

			if (status_collapsed[status.id] === undefined)
				status_collapsed[status.id] = status.collapsed || false;
		}

		add_leaves(root_task);
	}

	function handle_drop_card(ev, drop_zone_idx, drop_idx,
		{ col_idx, card_idx }) {

		let cols = [...columns.entries()];
		let status = cols[drop_zone_idx][0];

		let task = cols[col_idx][1][card_idx];

		if (status === undefined || !task)
			return;

		task.status = status;
		dispatch('persist', task);
		root_task = root_task;
	}

	function handle_collapse_column(column) {
		const c = !collapsed(column);
		status_collapsed[column] = c;

		let s = root_task._workspace.statuses.find(
			x => x.id === column);

		if (s) {
			s.collapsed = c || undefined;
			dispatch('persist', root_task);
		}

		root_task = root_task;
	}

	function get_container() {
		return [container];
	}

	function get_panels() {
		return panels;
	}

	function collapsed(st) {
		return status_collapsed[st];
	}
</script>

<main class="section container">
	<h3>{@html markdown.inline(root_task.summary)}</h3>

	<div class="kanban" bind:this={container}>
		{#each [...columns.entries()] as [column, cards], col_idx}
			<div class="task-col panel kanban-panel"
				class:collapsed="{collapsed(column)}">
				<header>
					<div class="control">
						<button class="control"
							title="{collapsed(column) ? 'expand' : 'collapse'}"
							on:click="{() => handle_collapse_column(column)}"
							>
							<svelte:component
								this={collapsed(column) ? icon_collapsed : icon_expanded}
								/>
						</button>
					</div>

					<div class="title">
						{#if column}
							{@html markdown.inline(column)}
						{:else if !collapsed(column)}
							<span style="opacity: 0.4">no status</span>
						{:else}
							&nbsp;
						{/if}
					</div>
				</header>

				<div class="panel-body"
					 bind:this={panels[col_idx]}>
					{#if !collapsed(column)}
						{#each cards as card, card_idx}
							<div class="kanban-card"
								 use:dnd={{
									context: {
										col_idx,
										card_idx,
									},
									ondrop: handle_drop_card,

									drop_zones: get_panels,
									vertical: true
								}}>
								<div>
									{@html markdown.inline(card.summary)}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>
</main>
