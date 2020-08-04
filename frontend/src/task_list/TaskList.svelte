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

<style>
	button {
		margin-top: -5px;
		margin-bottom: 5px;
	}

	div.controls {
		display: none;
	}
</style>

<script>
	import { createEventDispatcher, tick, onDestroy } from 'svelte';

	import * as model from '../model';
	import Task from './Task.svelte';

	export let root_task;

	const dispatch = createEventDispatcher();

	let selection = [];
	let last_selected = null;

	function selection_clear() {
		selection.forEach(task =>
			task.update(t => t.selected = false));
		selection = [];
	}

	onDestroy(() => {
		selection_clear();
	});

	function selection_clear_except_for_most_recent() {
		selection.splice(0, selection.length - 1).forEach((task) => {
			task.update(t => t.selected = false);
		});

		return selection[0];
	}

	function selection_sorted_idx_asc() {
		return selection.slice(0).sort((a, b) =>
			a.idx_in_parent() - b.idx_in_parent());
	}

	function selection_sorted_idx_desc() {
		return selection.slice(0).sort((a, b) =>
			b.idx_in_parent() - a.idx_in_parent());
	}

	function next_task_visually(task) {
		if (task.has_children()
				&& (!task.collapsed || task == root_task)) {
			return task.children.first();
		} else {
			let next_sibling;

			for(;; task = task.parent) {
				if (task == root_task)
					return null;

				if (next_sibling = task.next_sibling())
					return next_sibling;
			}
		}
	}

	function deepest_last_child(task) {
		while (task.has_children() && !task.collapsed)
			task = task.children.last();

		return task;
	}

	function previous_task_visually(task) {
		if (task == root_task)
			return null;

		let previous_sibling = task.previous_sibling();

		if (!previous_sibling)
			return task.parent;

		return deepest_last_child(previous_sibling);
	}

	function next_task() {
		if (selection.length == 1) {
			return next_task_visually(selection[0]);
		} else if (selection.length > 1) {
			return selection.last();
		} else if (last_selected) {
			let ls = last_selected;
			last_selected = null;
			return ls;
		} else {
			return root_task;
		}
	}

	function previous_task() {
		if (selection.length == 1) {
			return previous_task_visually(selection[0]);
		} else if (selection.length > 1) {
			return selection.last();
		} else if (last_selected) {
			let ls = last_selected;
			last_selected = null;
			return ls;
		} else {
			return deepest_last_child(root_task);
		}
	}

	function select_task(task) {
		if (!task)
			return;

		selection_clear();
		selection = [task];
		task.update(t => t.selected = true);
	}

	function collapse_selected() {
		let replace_selection = false;

		let to_collapse = new Set(selection.map((task) => {
			if ((!task.has_children() || task.collapsed)
					&& task != root_task) {
				replace_selection = true;
				return task.parent;
			}

			return task;
		}));

		to_collapse.forEach((task) =>
			task.update(t => t.collapsed = true));

		if (replace_selection) {
			// check to see if any of the tasks in to_collapse are now
			// themselves underneath another task in to_collapse. if so, remove
			// them from the selection.
			to_collapse.forEach((task) => {
				let parent;
				for (parent = task.parent; parent != root_task && parent.parent;
					parent = parent.parent) {

					if (to_collapse.has(parent))
						to_collapse.delete(task);
				}
			});

			selection_clear();
			selection = [...to_collapse];
			selection.forEach((task) =>
				task.update(t => t.selected = true));
		}
	}

	function collapse_recursive(task) {
		task.update(t => t.collapsed = true);
		task.children.forEach(collapse_recursive);
	}

	function uncollapse_recursive(task) {
		task.update(t => t.collapsed = false);
		task.children.forEach(uncollapse_recursive);
	}

	function collapse_immediate_children(task, collapsed) {
		if (task.collapsed && collapsed && task != root_task)
			return;

		if (task.collapsed)
			task.update(t => t.collapsed = false);

		task.children.forEach((subtask) => {
			if (subtask.has_children())
				subtask.update(t => t.collapsed = collapsed);
		});
	}

	function edit_selected(extra) {
		let selected = selection_clear_except_for_most_recent();
		if (!selected)
			return;

		selected.update(t =>
			t._edit_status = ['summary', extra]);
	}

	function auto_status_from_siblings(parent) {
		const child_statuses = parent.get_status();
		let st;

		if ((st = [...child_statuses.keys()].only()))
			return st;

		return null;
	}

	async function create_sibling_task(loc = 'after') {
		let task = selection_clear_except_for_most_recent();
		let delta = (loc == 'after') ? 1 : 0;
		let parent;
		let task_idx;

		if (!task || task == root_task) {
			if (loc == 'after')
				task = root_task.children.last();
			else
				task = root_task.children.first();

			parent = root_task;
		} else
			parent = task.parent;

		if (!task) {
			delta = 0;
			task_idx = 0;
		} else
			task_idx = task.idx_in_parent();

		let new_task = new model.Task('');
		new_task.status = auto_status_from_siblings(parent);

		parent.update(t =>
			t.add_child(new_task, task_idx + delta));
		dispatch('persist', parent);

		await tick();

		selection.push(new_task);
		new_task.selected = true;
		edit_selected();
	}

	async function create_child_task(task) {
		let new_task = new model.Task('');

		// try to auto-assign the status of the new child task
		if (!task.has_children())
			new_task.status = task.status;
		else
			new_task.status = auto_status_from_siblings(task);

		task.update(t => {
			t.collapsed = false;
			t.add_child(new_task, 0)
		});
		dispatch('persist', task);

		await tick();

		selection_clear();
		select_task(new_task);
		edit_selected();

		await tick();
	}

	function nest_in(task) {
		let sibling = task.previous_sibling();
		if (!sibling)
			return;

		const parent = sibling.parent;

		parent.update(() => {
			task.remove_from_parent();
			sibling.add_child(task);
			sibling.collapsed = false;
		});

		dispatch('persist', parent);
	}

	function nest_out(task) {
		if (task.parent == root_task)
			return;

		let grandparent = task.parent.parent;
		let parent_idx = task.parent.idx_in_parent();

		grandparent.update(t => {
			task.remove_from_parent();
			t.add_child(task, parent_idx + 1)
		});
		dispatch('persist', grandparent);
	}

	function swap_task_delta(task, delta) {
		let cur_idx = task.idx_in_parent();
		let new_idx = cur_idx + delta;
		let parent = task.parent;

		if (new_idx < 0 || new_idx >= parent.children.length)
			return;

		parent.update(t => {
			[t.children[cur_idx], t.children[new_idx]] =
				[t.children[new_idx], t.children[cur_idx]];
		});
		dispatch('persist', parent);
	}

	function exit_insert_mode() {
		let focused = document.activeElement;

		if (focused && focused.nodeName != 'BODY')
			document.activeElement.blur();
		else {
			last_selected = selection_clear_except_for_most_recent();
			selection_clear();
		}
	}

	function move_up(move_tasks_themselves) {
		if (move_tasks_themselves) {
			let sorted = selection_sorted_idx_asc();
			let sorted_set = new Set(sorted);

			sorted.forEach((task) => {
				// check to see if this operation would cause any of the
				// selected tasks to swap place with another selected task
				if (sorted_set.has(task.previous_sibling()))
					return;

				swap_task_delta(task, -1);
			});
		} else
			select_task(previous_task());
	}

	function move_down(move_tasks_themselves) {
		if (move_tasks_themselves) {
			let sorted = selection_sorted_idx_desc();
			let sorted_set = new Set(sorted);

			sorted.forEach((task) => {
				// check to see if this operation would cause any of the
				// selected tasks to swap place with another selected task
				if (sorted_set.has(task.next_sibling()))
					return;

				swap_task_delta(task, 1);
			});
		} else
			select_task(next_task());
	}

	const bindings = {
		KeyG: (ev) => {
			if (ev.shiftKey)
				select_task(deepest_last_child(root_task));
			else
				select_task(root_task);
		},

		KeyK: (ev) => move_up(ev.shiftKey),
		ArrowUp: (ev) => move_up(ev.ctrlKey),

		KeyJ: (ev) => move_down(ev.shiftKey),
		ArrowDown: (ev) => move_down(ev.ctrlKey),

		Minus: (ev) => {
			if (ev.ctrlKey && !ev.shiftKey)
				return true;

			if (ev.ctrlKey)
				selection.forEach(collapse_recursive);
			else if (ev.shiftKey)
				selection.forEach((task) =>
					collapse_immediate_children(task, true));
			else
				collapse_selected()

			// FIXME: more granular
			dispatch('persist', root_task);
		},

		Equal: (ev) => {
			if (ev.ctrlKey && !ev.shiftKey)
				return true;

			if (ev.ctrlKey)
				selection.forEach(uncollapse_recursive);
			else if (ev.shiftKey)
				selection.forEach((task) =>
					collapse_immediate_children(task, false));
			else
				selection.forEach((task) =>
					task.update(t => t.collapsed = false));

			// FIXME: more granular
			dispatch('persist', root_task);
		},

		Tab: (ev) => {
			ev.preventDefault();
			ev.stopPropagation();

			if (ev.shiftKey)
				selection_sorted_idx_desc().forEach(nest_out);
			else
				selection_sorted_idx_asc().forEach(nest_in);
		},

		KeyO: (ev) => {
			ev.preventDefault();
			create_sibling_task(ev.shiftKey ? 'before' : 'after');
		},

		KeyI: (ev) => {
			ev.preventDefault();

			edit_selected({
				cursor_position: 'start'
			});
		},

		KeyA: (ev) => {
			ev.preventDefault();

			edit_selected({
				cursor_position: 'end'
			});
		},

		KeyS: (ev) => {
			if (!ev.shiftKey)
				return true;

			ev.preventDefault();

			edit_selected({
				selection: 'all'
			});
		},

		Escape: () => exit_insert_mode(),

		Backspace: async () => {
			let sel = selection.only();

			if (!sel)
				return true;

			if (!sel.summary.length)
				handle_empty_node(sel);
		},

		BracketLeft: (ev) => {
			if (ev.ctrlKey)
				return;

			let selected = selection_clear_except_for_most_recent();
			if (selected == root_task)
				return;

			let sibling = selected.previous_sibling();

			if (ev.shiftKey)
				select_task(selected.parent);
			else if (!ev.shiftKey && sibling)
				select_task(sibling);
			else
				select_task(previous_task_visually(selected));
		},

		BracketRight: (ev) => {
			let selected = selection_clear_except_for_most_recent();
			let sibling = selected.next_sibling();

			if (ev.shiftKey && selected.has_children() && !selected.collapsed)
				select_task(selected.children.last());
			else if (!ev.shiftKey && sibling)
				select_task(sibling);
			else
				select_task(next_task_visually(selected));
		},

		Slash: (ev) => {
			if (ev.shiftKey || ev.ctrlKey)
				return true;

			if (!selection.length)
				return;

			dispatch('reroute_to_task',
				selection_clear_except_for_most_recent());
		},

		Enter: (ev) => {
			let task = selection_clear_except_for_most_recent();

			ev.preventDefault();

			if (ev.altKey) {
				if (!task)
					task = next_task();

				create_child_task(task);
			} else if (ev.shiftKey) {
				if (!task)
					return;

				task.update(t => t._edit_status = ['exposition']);
			} else if (task.has_children())
				create_child_task(task);
			else
				create_sibling_task('after');
		},

		Delete: (ev) => {
			let sel = selection;
			let new_sel = selection_clear_except_for_most_recent();

			// figure out where to move focus/selection after the delete
			if (ev.ctrlKey && new_sel.has_children())
				new_sel = new_sel.children.first();
			else if (new_sel.next_sibling())
				new_sel = new_sel.next_sibling();
			else
				new_sel = previous_task_visually(new_sel);

			const replace_with_children = ev.ctrlKey;

			sel.forEach((task) => {
				if (task == root_task)
					return;

				const parent = task.parent;
				parent.update(() =>
					task.remove_from_parent(replace_with_children));
				task = null;
				dispatch('persist', parent);
			});

			select_task(new_sel);
		}
	};

	async function handle_global_keydown(ev) {
		let tgt = ev.target;

		if (tgt.isContentEditable)
			return;

		let keybind = bindings[ev.code];
		if (keybind && !keybind(ev)) {
			ev.preventDefault();
			ev.stopPropagation();
			return;
		}

		switch (ev.code) {
		default:
			console.log(ev.code);
			break;
		}
	}

	function handle_select_task({ detail }) {
		const {task, multiple, range} = detail;

		if (multiple) {
			if (task.selected) {
				if (selection.length == 1)
					last_selected = selection.pop();
				else
					selection.splice(selection.indexOf(task), 1);

				task.update(t => t.selected = false);
			} else {
				selection.push(task);
				task.update(t => t.selected = true);
			}
		} else if (range) {
			let start = selection.last();

			if (!start || start.parent != task.parent) {
				// FIXME: inter-parent range selection
				return;
			}

			let start_idx = start.idx_in_parent();
			let end_idx = task.idx_in_parent();

			if (start_idx > end_idx)
				[start_idx, end_idx] = [end_idx, start_idx];

			for (let i = start_idx; i <= end_idx; i++) {
				let child = task.parent.children[i];

				if (child.selected)
					continue;

				selection.push(child);
				child.update(t => t.selected = true);
			}
		} else {
			selection_clear();
			selection = [task];

			task.update(t => t.selected = true);
		}
	}

	async function handle_empty_node(task) {
		let new_sel = null;

		if (task.has_children())
			new_sel = task.children.first();
		else if (!task.selected)
			new_sel = null;
		else if (selection.length == 1)
			new_sel = previous_task();
		else
			selection.splice(selection.indexOf(task), 1);

		const parent = task.parent;
		parent.update(() =>
			task.remove_from_parent(true));
		dispatch('persist', parent);

		if (new_sel)
			select_task(new_sel);
	}
</script>

<svelte:body
	on:keydown={handle_global_keydown}
	/>

<main class="section container grid-xl">
	<ul class="task_list">
		<Task bind:task={root_task}
			  {selection}
			  is_root_task={true}
			  on:select_task={handle_select_task}
			  on:empty_node={ev => handle_empty_node(ev.detail)}
			  on:reroute_to_task
			  on:persist/>
	</ul>
</main>
