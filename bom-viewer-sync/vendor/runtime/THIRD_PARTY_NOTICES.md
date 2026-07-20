# Runtime third-party notices

The Admin and standalone Viewer bundles include the following exact packages. Versions are pinned by `package-lock.json`; SheetJS CE is also vendored as the official tarball recorded in `manifest.json`.

| Package | Version | Relationship | License | Source |
| --- | --- | --- | --- | --- |
| `@google/model-viewer` | 4.3.1 | Direct | Apache-2.0 | https://github.com/google/model-viewer |
| `xlsx` | 0.20.3 | Direct | Apache-2.0 | https://git.sheetjs.com/SheetJS/sheetjs |
| `@lit/reactive-element` | 2.1.2 | Transitive, bundled | BSD-3-Clause | https://github.com/lit/lit |
| `@monogrid/gainmap-js` | 3.4.0 | Transitive, bundled | MIT | https://github.com/MONOGRID/gainmap-js |
| `lit` | 3.3.3 | Transitive, bundled | BSD-3-Clause | https://github.com/lit/lit |
| `lit-element` | 4.2.2 | Transitive, bundled | BSD-3-Clause | https://github.com/lit/lit |
| `lit-html` | 3.3.3 | Transitive, bundled | BSD-3-Clause | https://github.com/lit/lit |
| `three` | 0.183.2 | Transitive, bundled | MIT | https://github.com/mrdoob/three.js |

The package distributions in `node_modules` contain their complete license texts. The repository-local SheetJS tarball contains `package/LICENSE` and `package/dist/LICENSE`. This notice records packages present in the emitted browser bundle according to the esbuild input graph; it does not claim that every install-time package is shipped.
