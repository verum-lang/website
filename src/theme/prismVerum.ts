/**
 * Docusaurus client module that registers the Verum Prism language
 * before any code blocks are highlighted.
 */
import registerVerum from '../prism-verum';

if (typeof window !== 'undefined') {
  // Browser: defer until prism-react-renderer's Prism global is available.
  // prism-react-renderer attaches to (window as any).Prism when initialised,
  // but we register synchronously against any present instance and also
  // export the function so SSR can invoke it.
  const w = window as any;
  if (w.Prism) registerVerum(w.Prism);
  // Re-attempt once on next tick to catch lazy load.
  setTimeout(() => { if (w.Prism) registerVerum(w.Prism); }, 0);
}

// Also run during SSR by importing prism-react-renderer's bundled Prism.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const {Prism} = require('prism-react-renderer');
  if (Prism) registerVerum(Prism);
} catch {
  // prism-react-renderer not available at build time on server — ignore.
}
