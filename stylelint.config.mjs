// Correctness-focused CSS lint, mirroring eslint.config.js's split between
// "real problems" and pure formatting preference: stylelint-config-recommended
// is possible-error rules only (unknown properties/values, duplicate
// selectors/properties, empty rules, deprecated syntax, ...) — no naming
// conventions or notation-style opinions, which would either fight the
// project's existing camelCase ids/classes (shared with the JS that
// references them) or force a cosmetic rewrite of a 3000+ line stylesheet
// unrelated to catching real bugs.

export default {
  extends: ["stylelint-config-recommended"],
  ignoreFiles: ["public/**", "resources/**", "themes/**"],
  rules: {
    // Retrofitting selector order across an organically-grown, 3000+ line
    // stylesheet to satisfy this is a real risk (source order breaks ties at
    // equal specificity) for no correctness gain — this isn't a rule
    // SonarCloud's own CSS analyzer checks for either. Keep new rules in
    // specificity order where it's easy; don't reorder existing ones to
    // chase this warning.
    "no-descending-specificity": null,
    // page-break-{before,after,inside} are deprecated in favour of
    // break-{before,after,inside}, but this file's print/booklet CSS has a
    // documented history of print-engine-specific bugs (see git log:
    // "Fix printed-page titles and Firefox print pagination") — the
    // page-break-* names remain the most broadly-supported spelling across
    // print engines, so don't swap them without dedicated print testing.
    "property-no-deprecated": [
      true,
      { ignoreProperties: ["page-break-before", "page-break-after", "page-break-inside"] },
    ],
    // ::selectedcontent (styling the trigger's copy of the selected <option>
    // in a customizable <select>) is a real, newly-shipped pseudo-element
    // stylelint's built-in list doesn't know about yet.
    "selector-pseudo-element-no-unknown": [true, { ignorePseudoElements: ["selectedcontent"] }],
  },
};
