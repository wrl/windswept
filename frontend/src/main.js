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

import './style/global.scss';

import App from './App.svelte';

////
// builtin type augmentations
////

Array.prototype.first = function() {
	if (!this.length)
		return null;
	return this[0];
}

Array.prototype.last = function() {
	if (!this.length)
		return null;
	return this[this.length - 1];
}

Array.prototype.only = function() {
	if (this.length == 1)
		return this[0];
	return null;
}

export default new App({
	target: document.body
});
