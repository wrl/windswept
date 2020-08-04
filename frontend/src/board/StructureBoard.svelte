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

	function handle_drop_list(ev, drop_zone_idx, drop_idx, task_idx) {
		root_task.children.splice(drop_idx, 0,
			...root_task.children.splice(task_idx, 1));
		dispatch('persist', root_task);
		root_task = root_task;
	}

	function handle_drop_card(ev, drop_zone_idx, drop_idx,
			{ task_idx, subtask_idx }) {
		let parent = root_task.children[drop_zone_idx];

		let task = root_task.children[task_idx].children[subtask_idx];

		task.remove_from_parent();
		parent.add_child(task, drop_idx);

		dispatch('persist', root_task);
		root_task = root_task;
	}

	function handle_collapse_column(task) {
		task.collapsed = !task.collapsed;
		dispatch('persist', root_task);
		root_task = root_task;
	}

	function get_container() {
		return [container];
	}

	function get_panels() {
		return panels;
	}
</script>

<main class="section container">
	<h3>{@html markdown.inline(root_task.summary)}</h3>

	<div class="kanban" bind:this={container}>
		{#each root_task.children as task, task_idx}
			<div class="task-col panel kanban-panel"
				class:collapsed="{task.collapsed}"
				class:has-children="{task.has_children()}"
				>
				<header>
					<div class="control">
						<button class="control"
							title="{task.collapsed ? 'expand' : 'collapse'}"
							on:click="{() => handle_collapse_column(task)}"
							>
							<svelte:component
								this={task.collapsed ? icon_collapsed : icon_expanded}
								/>
						</button>
					</div>

					<div class="title"
						use:dnd={{
							context: task_idx,
							ondrop: handle_drop_list,

							drop_zones: get_container,
							vertical: false
						 }}
						 on:click={(ev) => {
							if (ev.altKey)
								dispatch('reroute_to_task', task);
						 }}>
						{@html markdown.inline(task.summary)}
					</div>
				</header>

				<div class="panel-body"
					 bind:this={panels[task_idx]}>
					{#if !task.collapsed && task.has_children()}
						{#each task.children as subtask, subtask_idx}
							<div class="kanban-card"
								 class:done={subtask.has_only_status('done')}
								 use:dnd={{
									context: {
										task_idx,
										subtask_idx
									},

									ondrop: handle_drop_card,

									drop_zones: get_panels,
									vertical: true
								 }}>
								<div>
									{@html markdown.inline(subtask.summary)}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>
</main>
