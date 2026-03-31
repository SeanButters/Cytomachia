import { Component, signal } from '@angular/core';
import { GpuCanvasComponent } from './simulationControl/simulationWindow/simulation-window';
import { ConfigurationHandler } from './simulationControl/configuration-handler/configuration-handler';

@Component({
  selector: 'app-root',
  imports: [
    GpuCanvasComponent,
    ConfigurationHandler
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('cytomachia');
}
