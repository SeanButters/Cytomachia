import { 
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
} from '@angular/core';
import { WebGPUService } from './webgpu';

@Component({
  selector: 'app-gpu-canvas',
  imports: [],
  templateUrl: './gpu-canvas.html',
  styleUrl: './gpu-canvas.scss',
})
export class GpuCanvasComponent implements AfterViewInit, OnDestroy {
  // Injectable constructors
  constructor(
    private gpu: WebGPUService,
    private zone: NgZone
  ) {}

  private isPaused = false;

  // Camera stuff
  private dpr!: number;
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

  // Canvas element
  @ViewChild('canvas', {static: true}) canvasRef!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement;

  // Maintain canvas aspect ratio vars
  private resizeObserver?: ResizeObserver;   // Resize observer to maintain canvas dimensions
  private resizePending = false;  // Schedule resize in animation frame to not anger the resize observer

  ///
  /// Angular Lifecycle Hooks
  ///
  async ngAfterViewInit() {
    // Wait until canvas is in DOM to initialize GPU
    this.canvas = this.canvasRef.nativeElement;
    await this.gpu.init(this.canvas);

    // Setup canvas
    this.dpr = window.devicePixelRatio || 1;
    this.resizeCanvas();
    this.initResizeObserver();
    window.addEventListener('keydown', this.handleKey);
    this.canvas.addEventListener('wheel', this.onScroll, { passive: false });
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.gpu.renderFrame();

    // Start render compute loop
    this.startGpuLoop();
  }

  ngOnDestroy(): void {
    // Remove any subscriptions on destroy
    window.removeEventListener('keydown', this.handleKey);
    this.canvas.removeEventListener('wheel', this.onScroll);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.resizeObserver?.disconnect();
    this.gpu.destroy();
  }

  ///
  /// Component Methods
  ///
  // Start GPU loop
  private startGpuLoop() {
    this.zone.runOutsideAngular(() => {
      this.gpu.start();
    });
  }

  private pauseLoop() {
      this.gpu.pause();
      // TODO remove console log
      if(this.isPaused) console.log("Unpaused");
      else console.log("Paused");

      this.isPaused = !this.isPaused;
  }

  private handleKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.pauseLoop();
    }
    if (e.code === 'KeyN') {
      if(!this.isPaused) this.pauseLoop();
      this.gpu.stepOnce();
    }
    if (e.code === 'KeyR') {
      this.gpu.randomizeGrid();
    }
  };

  private onScroll = (e: WheelEvent) => {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();

    const mouseX = (e.clientX - rect.left) * this.dpr;
    const mouseY = this.canvas.height - ((e.clientY - rect.top) * this.dpr);

    const zoomFactor = 1.1;

    const zoomMultiplier = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;

    this.gpu.zoomAt(mouseX, mouseY, zoomMultiplier);
  };

  private onMouseDown = (e: MouseEvent) => {
    this.canvas.classList.add('clicked');
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onMouseUp = () => {
    this.canvas.classList.remove('clicked');
    this.isDragging = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;

    const dx = (e.clientX - this.lastX) * this.dpr;
    const dy = (this.lastY - e.clientY) * this.dpr;

    this.lastX = e.clientX;
    this.lastY = e.clientY;

    this.gpu.cameraMove(dx, dy);
  };

  // TODO Helper method to sleep maybe not needed in future?
  // sleep(ms: number) {
  //   return new Promise(resolve => setTimeout(resolve, ms));
  // }

  private initResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize();
    });

    this.resizeObserver.observe(document.body);
  }

  private scheduleResize() {
    if(this.resizePending) return;
    this.resizePending = true;

    requestAnimationFrame(() => {
      this.resizeCanvas();
      this.resizePending = false;
    });
  }

  // Resize canvas to same aspect ratio when window is resized
  private resizeCanvas() {
    const width = Math.floor(this.canvas.clientWidth * this.dpr);
    const height = Math.floor(this.canvas.clientHeight * this.dpr);
    if(this.canvas.width === width && this.canvas.height === height) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;

    this.gpu.resizeCanvas(width, height);
    this.gpu.renderFrame();
  }


}
