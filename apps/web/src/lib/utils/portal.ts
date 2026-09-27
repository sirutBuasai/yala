// Moves an element out of any ancestor that clips, stacks or transforms it: under a transform,
// `position: fixed` is placed against that ancestor instead of the viewport. Into the enclosing dialog
// when there is one, since a modal leaves everything outside its top layer inert.

export function portal(node: HTMLElement) {
	(node.parentElement?.closest('dialog') ?? document.body).append(node);
	return { destroy: () => node.remove() };
}
