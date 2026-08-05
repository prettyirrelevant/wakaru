/**
 * Bumped when parser output changes, so imports record what produced them.
 *
 * Kept out of the worker module on purpose. Importing this from the main
 * thread must not drag in the parsers, xlsx and pdf.js — or run the worker's
 * top-level `Comlink.expose`.
 */
export const PARSER_VERSION = '2';
