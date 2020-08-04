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

import { loop, now } from 'svelte/internal';
import { expoOut as cancel_ease } from 'svelte/easing';

function point_in_bounds([x, y], rect, vertical) {
	if (vertical)
		return (rect.top < y) && (y < rect.bottom);

	return (rect.left < x) && (x < rect.right);
}

function mouse_in_bounds(ev, rect, vertical) {
	return point_in_bounds([ev.clientX, ev.clientY], rect, vertical);
}

function point_after(pt, rect, vertical) {
	if (vertical)
		return (rect.top + (rect.height * 0.5)) < pt[1];

	return (rect.left + (rect.width * 0.5)) < pt[0];
}

const dnd_cursor_hover = 'grab';
const dnd_cursor_dragging = 'grabbing';

export function dnd(node, options) {
	let drag = {};

	function update_position(tgt, ev) {
		let x = ev.clientX - drag.off_x + window.scrollX;
		let y = ev.clientY - drag.off_y + window.scrollY;

		tgt.style.top = y + 'px';
		tgt.style.left = x + 'px';

		return [x, y];
	}

	function update_drop_zone(ev) {
		let drop_zone_rect = drag.drop_zone_rect;

		if (drop_zone_rect
			&& mouse_in_bounds(ev, drop_zone_rect, !drag.zones_vertical))
			return;

		let drop_zone = null;

		for (let i = 0; i < drag.drop_zones.length; i++) {
			let rect = drag.drop_zones[i].getBoundingClientRect();

			if (mouse_in_bounds(ev, rect, !drag.zones_vertical)) {
				drop_zone_rect = rect;
				drop_zone = drag.drop_zones[i];
			}
		}

		if (drag.drop_zone) {
			drag.drop_zone.classList.remove('drop_hover');
			drag.placeholder.parentNode.removeChild(drag.placeholder);
			drag.element_above = null;
			drag.placeholder_rect = null;
		}

		drag.drop_zone = drop_zone;

		if (drop_zone) {
			drop_zone.classList.add('drop_hover');
			drag.drop_zone_rect = drop_zone_rect;
		} else {
			drag.drop_zone_rect = null;
		}
	}

	function shrink_bounds(rect, factor, vertical) {
		factor = 1.0 - factor;

		if (vertical) {
			let height = rect.height * factor;
			let top = rect.top + (0.5 * (rect.height - height));
			let bottom = top + height;

			return { top, height, bottom };
		} else {
			let width = rect.width * factor;
			let left = rect.left + (0.5 * (rect.width - width));
			let right = left + width;

			return { left, width, right };
		}
	}

	function update_drop_idx(ev, upper_left) {
		let dz = drag.drop_zone;

		if (!dz)
			return;

		let pt = upper_left.map(
			(x, i) => x + drag.tgt_midpoint[i]);

		if (drag.placeholder_rect
				&& point_in_bounds(pt, drag.placeholder_rect,
					drag.zones_vertical))
			return;

		let vertical = drag.zones_vertical;
		let new_idx = 0;

		let len = dz.childNodes.length;
		let elem;
		let i;

		for (i = 0; i < len; i++) {
			elem = dz.childNodes[i];

			if (elem == drag.target || elem == drag.placeholder
					|| elem.nodeName == "#text")
				continue;

			let rect = elem.getBoundingClientRect();

			if (!point_after(pt, rect, vertical))
				break;

			new_idx++;
		}

		if (drag.idx == new_idx && drag.placeholder_rect)
			return;

		if (i == len)
			elem = null;

		if (elem)
			drag.drop_zone.insertBefore(drag.placeholder, elem);
		else
			drag.drop_zone.appendChild(drag.placeholder);

		drag.idx = new_idx;
		drag.placeholder_rect = drag.placeholder.getBoundingClientRect();
	}

	function tidy_dragged_element(tgt) {
		tgt.style.top = '';
		tgt.style.left = '';
		tgt.style.position = '';
		tgt.style.transform = '';
		tgt.style['z-index'] = '';
	}

	function set_elem_tilt(tgt, tilt) {
		tgt.style.transform = 'rotate(' + (tilt * 4) + 'deg)';
	}

	const cancel_anim_speed = 2.5;

	async function settle_animation(tgt, dest, speed) {
		const rect = tgt.getBoundingClientRect();
		const tgt_end = [rect.left, rect.top];
		const delta = dest.map((a, i) => a - tgt_end[i]);
		const tilt = drag.tilt;

		const distance = Math.sqrt(
			delta.map((x) => x * x).reduce((a, x) => a + x, 0));

		if (!speed)
			speed = cancel_anim_speed;
		else
			speed *= cancel_anim_speed;

		// rather than a fixed duration, we want longer distances to take a
		// little more time
		const duration = Math.max(distance / speed, 90);

		let start = now();
		let task = loop(now => {
			const elapsed = now - start;

			if (elapsed > duration)
				return false;

			const x = cancel_ease(elapsed / duration);
			const lerp = delta.map((v) => v * x)

			tgt.style.left = (tgt_end[0] + lerp[0]) + 'px';
			tgt.style.top = (tgt_end[1] + lerp[1]) + 'px';

			set_elem_tilt(tgt, (1.0 - x) * tilt);
			return true;
		});

		await task.promise;

		tidy_dragged_element(tgt);
	}

	async function handle_drop(ev) {
		let tgt = drag.target;

		window.removeEventListener('mouseup', handle_drop, { capture: true });
		window.removeEventListener('mousemove', handle_drag, { capture: true });
		window.removeEventListener('keydown', handle_keydown, { capture: true });

		tgt.classList.remove('being-dragged');
		node.style.cursor = dnd_cursor_hover;

		if (drag.start_window) {
			drag = {};
			return;
		}

		if (drag.drop_zone)
			drag.drop_zone.classList.remove('drop_hover');

		const cancelled = drag.cancel || !drag.drop_zone;

		let dest = (cancelled)
			? drag.tgt_start
			: [drag.placeholder.offsetLeft, drag.placeholder.offsetTop];

		const speed_multiplier = drag.cancel ? 0.8 : 2.0;
		drag.settle_anim = settle_animation(tgt, dest, speed_multiplier);
		await drag.settle_anim;
		drag.settle_anim = null;

		if (!cancelled) {
			let drop_zone_idx = drag.drop_zones.indexOf(drag.drop_zone);
			drag.ondrop(ev, drop_zone_idx, drag.idx, drag.context);
		}

		if (drag.placeholder.parentNode)
			drag.placeholder.parentNode.removeChild(drag.placeholder);

		drag = {};
	}

	function actually_start_drag(ev) {
		let { context, ondrop, drop_zones, vertical } = options;
		let tgt = drag.target;

		let rect = tgt.getBoundingClientRect();

		drag.context = context;
		drag.ondrop = ondrop;

		drag.tgt_start = [rect.left, rect.top];
		drag.tgt_midpoint = [
			(rect.width * 0.5),
			(rect.height * 0.5)
		];

		drag.off_x = drag.start_pt[0] - rect.left;
		drag.off_y = drag.start_pt[1] - rect.top;

		drag.zones_vertical = vertical;

		let ph = document.createElement('div');
		ph.classList.add('placeholder');

		ph.style['min-height'] = rect.height + 'px';

		if (!vertical)
			ph.style['min-width'] = rect.width + 'px';

		drag.placeholder = tgt.parentNode.insertBefore(ph, tgt);

		let x_tilt = 1.0 - (2.0 * (drag.off_x / rect.width));
		let y_tilt = 1.0 - (2.0 * (drag.off_y / rect.height));
		drag.tilt = x_tilt * y_tilt;

		tgt.style.position = 'absolute';
		tgt.style['z-index'] = '9999';
		tgt.classList.add('being-dragged');
		set_elem_tilt(tgt, drag.tilt);
	}

	function handle_keydown(ev) {
		if (ev.code == 'Escape') {
			drag.cancel = true;
			handle_drop();
		}
	}

	function handle_drag(ev) {
		let sw = drag.start_window;

		if (sw) {
			if (mouse_in_bounds(ev, sw, true)
				&& mouse_in_bounds(ev, sw, false))
				return;

			drag.start_window = null;
			actually_start_drag(ev);
		}

		const upper_left = update_position(drag.target, ev);
		update_drop_zone(ev);
		update_drop_idx(ev, upper_left);
	}

	const start_window = 7.0;

	async function handle_drag_start(ev) {
		if (drag.settle_anim)
			await drag.settle_anim;

		let { drop_zones } = options;

		if (typeof(drop_zones) == 'function')
			drop_zones = drop_zones();

		drag.drop_zones = drop_zones;
		drag.drop_zones_set = new Set(drop_zones);

		let tgt = ev.target;

		while (!drag.drop_zones_set.has(tgt.parentNode) && tgt.nodeName != 'BODY')
			tgt = tgt.parentNode;

		drag.target = tgt;

		if (tgt.nodeName == 'BODY') {
			throw 'drag target outside of any known drop zones';
			return;
		}

		node.style.cursor = dnd_cursor_dragging;

		drag.start_pt = [ev.clientX, ev.clientY];
		drag.start_window = {
			top:    ev.clientY - start_window,
			bottom: ev.clientY + start_window,
			left:   ev.clientX - start_window,
			right:  ev.clientX + start_window
		};

		window.addEventListener('mouseup', handle_drop, { capture: true });
		window.addEventListener('mousemove', handle_drag, { capture: true });
		window.addEventListener('keydown', handle_keydown, { capture: true });
	}

	node.addEventListener('mousedown', handle_drag_start);

	node.style.cursor = dnd_cursor_hover;

	return {
		destroy() {
			node.removeEventListener('mousedown', handle_drag_start);
		}
	}
}
