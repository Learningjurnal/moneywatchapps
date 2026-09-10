// eslint.config.js — static "does this identifier actually exist?" check.
//
// WHY THIS EXISTS: added after a real production incident (2026-09-10,
// see INCIDENT_LOG.md #1). A provider-adapter refactor moved
// getBeiTickSize() into a different file than the function that called
// it, and nothing caught the missing import — `node --check` (what
// npm run lint used exclusively before this) only parses syntax; it
// does NOT resolve whether a referenced name is actually declared or
// imported anywhere in scope. A call to an undefined function is
// syntactically valid JavaScript, so it silently passed every check
// this project had, all the way into production, and broke live quotes
// for every ticker until a user found it in the Vercel logs.
// `no-undef` below is the specific rule that catches exactly that class
// of bug — statically, before merge, with no test run required.
//
// SCOPE — deliberately narrow, not "the whole repo":
// This only lints lib/**/*.js and server.js: real ES modules with
// explicit import/export, where "is this name actually imported?" has
// one unambiguous right answer. public/js/*.js is intentionally
// EXCLUDED — those are vanilla <script> tags sharing one implicit
// global scope across ~50 files by architecture (function/var
// declared in one file is legitimately callable from another via the
// browser's global object, with no import statement at all). Running
// no-undef there as-is would flag hundreds of true, working
// cross-file references as errors; making it accurate would require
// hand-maintaining a global allowlist of every such name, which is a
// bigger, separate effort with a different risk/value trade-off than
// this fix. If that ever becomes worth doing, it's a new config block
// here, not an extension of this one.
import globals from 'globals';

export default [
  {
    files: ['lib/**/*.js', 'server.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-undef': 'error'
    }
  }
];
