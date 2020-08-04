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

	ul.menu {
		position: absolute;
		padding: $unit-2;
	}

	.menu-item a {
		display: flex;
		align-items: center;
		flex-direction: row-reverse;
		justify-content: space-between;

		cursor: pointer;
		padding: $unit-h $unit-1;
	}

	$badge_height: 0.8rem;

	.menu-item a > div {
		padding: 0;
		margin: 0;
		margin-left: 1em;

		height: $badge_height;

		border: 0;

		line-height: $badge_height;
		font-size: 0.5rem;
		font-weight: bold;

		color: $light-color;
	}

	.menu-item a > div > div {
		content: "";
		background: $primary-color-dark;

		border: 0;
		border-radius: 4px;

		min-width: $badge_height;

		width: 100%;
		height: 100%;
	}

	.menu-item a > div > span {
		display: block;
		padding: 0 0.3rem;
		position: relative;
		z-index: 1;
	}

	.menu-item a > div > span.dark_text {
		color: $primary-color-dark;
	}

	.menu-item a > div.display_text > div {
		position: relative;
		top: -$badge_height;
	}
</style>

<script>
	import { createEventDispatcher, onMount } from 'svelte';

	export let top_left;
	export let items;
	export let display_frac_text = true;

	const dispatch = createEventDispatcher();

	let menu_node;

	function handle_menu_item_click(item) {
		return () => {
			dispatch('item_selected', item);
			dispatch('close');
		};
	}

	function handle_menu_click(ev) {
		ev.preventDefault();
		ev.stopPropagation();
	}

	function handle_window_click(ev) {
		dispatch('close');
	}

	let handled_first_context_menu_event = false;

	function handle_context_menu(ev) {
		if (!handled_first_context_menu_event) {
			handled_first_context_menu_event = true;
			return;
		}

		dispatch('close');
	}

	function handle_global_keydown(ev) {
		ev.preventDefault();
		ev.stopPropagation();

		dispatch('close');
	}

	const edge_margin = 20;

	onMount(() => {
		let rect = menu_node.getBoundingClientRect();

		let win_bottom = document.documentElement.clientHeight + window.scrollY;
		let win_right = document.documentElement.clientWidth + window.scrollX;

		top_left[0] -= Math.max(0,
			edge_margin - (win_right - (top_left[0] + rect.width)));
		top_left[1] -= Math.max(0,
			edge_margin - (win_bottom - (top_left[1] + rect.height)));

		menu_node.style.left = top_left[0] + 'px';
		menu_node.style.top = top_left[1] + 'px';

		document.addEventListener('keydown', handle_global_keydown,
			{ capture: true });

		return () => {
			document.removeEventListener('keydown', handle_global_keydown,
				{ capture: true });
		}
	});

	function map_opacity(o) {
		if (o < 0.001)
			return 0.0;

		o = Math.pow(Math.min(o, 1.0), 1.1);
		return 0.1 + (0.9 * o);
	}

	function frac_dark_text(f) {
		return f && f < 0.3;
	}
</script>

<svelte:window
	on:click={handle_window_click}
	on:contextmenu={handle_context_menu}
	/>

<ul class="menu"
	bind:this={menu_node}
	on:click={handle_menu_click}>
	{#each items as item}
		{#if item.display}
			<li class="menu-item">
				<a href="javascript:void(0);"
						on:click={handle_menu_item_click(item.val)}>
						<div class:display_text={display_frac_text}>
							{#if display_frac_text}
								<span class:dark_text={frac_dark_text(item.fraction)}>
									{Math.round(item.fraction * 100)}%
								</span>
							{/if}
							<div style="opacity: {map_opacity(item.fraction)}"></div>
						</div>
					<span>{@html item.display}</span>
				</a>
			</li>
		{:else}
			<li class="divider"></li>
		{/if}
	{/each}
</ul>
