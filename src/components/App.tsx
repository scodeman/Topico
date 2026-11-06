import { Canvas } from './Canvas';
import { DetailsPane } from './DetailsPane';
import { Explorer } from './Explorer';
import { Toolbar } from './Toolbar';

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <Explorer />
        <Canvas />
        <DetailsPane />
      </main>
    </div>
  );
}
