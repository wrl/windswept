/**
 * windswept: task management for the ambitious
 * Copyright (C) 2020 William Light
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

class StoreLike {
	constructor() {
		this._subscriptions = [];
	}

	notify_subscribers() {
		this._subscriptions.forEach(s => s(this));
	}

	set(from) {
		if (from !== this)
			Object.assign(this, from);

		this.notify_subscribers();
	}

	update(fn) {
		fn(this);
		this.notify_subscribers();
	}

	subscribe(s) {
		this._subscriptions.push(s);
		s(this);

		return () => {
			const idx = this._subscriptions.indexOf(s);
			if (idx !== -1)
				this._subscriptions.splice(idx, 1);
		}
	}
}

export class Task extends StoreLike {
	constructor(summary, children) {
		super();

		this.summary = summary || '';
		this.children = children || [];
		this.exposition = '';

		this.status = null;
		this.collapsed = false;

		this._parent = null;
		this._edit_status  = false;
		this._selected = false;
	}

	get id() {
		return this.summary;
	}

	get parent() {
		return this._parent;
	}

	set parent(p) {
		this._parent = p;
	}

	get selected() {
		return this._selected;
	}

	set selected(s) {
		this._selected = s;
	}

	set_status(new_status) {
		if (!this.has_children()) {
			this.status = new_status;
			return;
		}

		this.children.forEach(
			(c) => c.set_status(new_status));
	}

	get_status() {
		let statuses = new Map();

		if (!this.has_children()) {
			statuses.set(this.status, [1.0, 1]);
			return statuses;
		}

		let total_leaves = 0;

		let get_rec = (task) => {
			if (!task.has_children()) {
				let st_count = statuses.get(task.status);

				if (!st_count)
					st_count = 0;

				statuses.set(task.status, st_count + 1);
				total_leaves++;
			} else
				task.children.forEach(get_rec);
		};

		get_rec(this);

		for (let [k, v] of statuses.entries()) {
			statuses.set(k, [v / total_leaves, v]);
		}

		return statuses;
	}

	has_only_status(s) {
		let [id, [frac, _]] = this.get_status().entries().next().value;
		return id == s && frac == 1.0;
	}

	idx_in_parent() {
		if (!this._parent)
			return -1;

		return this._parent.children.indexOf(this);
	}

	remove_from_parent(replace_with_children = false) {
		if (!this._parent)
			throw 'task has no parent';

		let idx = this.idx_in_parent();
		let rep = [];

		if (replace_with_children) {
			rep = this.children;
			this.children.forEach((c) => c.parent = this._parent);
		}

		this._parent.children.splice(this.idx_in_parent(), 1, ...rep);
		this._parent = null;
	}

	add_child(child, idx = -1) {
		if (child.parent)
			throw 'child task already has a parent';

		child.parent = this;
		child._workspace = this._workspace;

		if (idx == -1)
			this.children.push(child);
		else
			this.children.splice(idx, 0, child);
	}

	has_children() {
		return (this.children.length > 0);
	}

	next_sibling() {
		let our_idx = this.idx_in_parent();

		if (our_idx < 0 || our_idx >= (this._parent.children.length - 1))
			return null;

		return this._parent.children[our_idx + 1];
	}

	previous_sibling() {
		let our_idx = this.idx_in_parent();

		if (our_idx <= 0)
			return null;

		return this._parent.children[our_idx - 1];
	}

	notify_hierarchy() {
		for (let t = this.parent; t; t = t.parent)
			t.notify_subscribers();
	}
}

export class Workspace extends Task {
	constructor(summary, children) {
		super(summary, children);

		this.statuses = [];
		this._workspace = this;
	}
}
