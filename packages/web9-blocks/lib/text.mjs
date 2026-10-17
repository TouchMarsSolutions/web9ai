// A stored block text field as a renderer prints it. The save check rejects a value that is not a string, but a row
// from before that rule, or written past it, must not take the page down: Astro's escaping and String() throw on
// {"toString":1} and overflow on an array nested a few thousand deep. So anything but a string renders as "".

/** `value` when it is a string, otherwise "" (its toString is never called). */
export const text = (value) => (typeof value === "string" ? value : "");
