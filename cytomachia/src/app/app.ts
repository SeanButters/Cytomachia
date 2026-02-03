import { Component, signal } from '@angular/core';
import { GpuCanvasComponent } from './gpu-canvas/gpu-canvas';

@Component({
  selector: 'app-root',
  imports: [GpuCanvasComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('cytomachia');
}
