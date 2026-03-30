import { 
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip';
import { WebGPUService } from './gpu-service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-gpu-canvas',
  imports: [
    MatIconModule,
    MatTooltip
],
  templateUrl: './simulation-window.html',
  styleUrl: './simulation-window.scss',
})
export class GpuCanvasComponent implements AfterViewInit, OnDestroy {
  // Injectable constructors
  constructor(
    private gpu: WebGPUService,
    private zone: NgZone,
    private changeDetector: ChangeDetectorRef,
  ) {}

  // Canvas element
  @ViewChild('canvas', {static: true}) canvasRef!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement;

  public isPaused = false;
  public isCompact = false;
  public isLoading = true;
  private isLoadingSubscription!: Subscription;
  public interactionMode = 'drag'
  private noiseGenerator = 'fractal'

  // Camera Controls
  private dpr!: number;
  private isDragging = false;
  private lastX = 0;
  private lastY = 0;

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
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp)
    this.canvas.addEventListener('wheel', this.onScroll, { passive: false });
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.isLoadingSubscription = this.gpu.isLoadingObservable.subscribe(value => {
      console.log(value)
      this.isLoading = value;
      this.changeDetector.detectChanges();
    });
    this.gpu.renderFrame();

    this.startGpuLoop(document.visibilityState === 'hidden');
  }

  ngOnDestroy(): void {
    // Remove any subscriptions on destroy
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp)
    this.canvas.removeEventListener('wheel', this.onScroll);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.resizeObserver?.disconnect();
    this.isLoadingSubscription.unsubscribe();
    this.gpu.destroy();
  }

  ///
  /// Component Methods
  ///
  // Start GPU loop
  private startGpuLoop(isHidden: boolean) {
    this.zone.runOutsideAngular(() => {
      this.gpu.start(isHidden);
    });
  }

  public pauseLoop() {
    this.gpu.pause();
    this.isPaused = !this.isPaused;
    this.changeDetector.detectChanges();
  }

  public toggleCompactMode() {
    this.isCompact = !this.isCompact;
    this.changeDetector.detectChanges();
    this.scheduleResize();
  }

  public updateInteractionMode(newMode: string) {
    this.interactionMode = newMode;
  }

  public stepOnce() {
    if(!this.isPaused) this.pauseLoop();
    this.gpu.stepOnce();
  }

  public randomizeGrid() {
    this.gpu.randomizeGrid(this.noiseGenerator);
  }

  public zoomInOut(isZoomIn: boolean) {
    const rect = this.canvas.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const zoomFactor = 1.25;
    const zoomMultiplier = isZoomIn ? zoomFactor : 1 / zoomFactor;

    this.zoomAtClientPoint(centerX, centerY, zoomMultiplier);
  }

  private zoomAtClientPoint(clientX: number, clientY: number, zoomMultiplier: number) {
    const rect = this.canvas.getBoundingClientRect();

    const x = (clientX - rect.left) * this.dpr;
    const y = this.canvas.height - ((clientY - rect.top) * this.dpr);

    this.gpu.zoomAt(x, y, zoomMultiplier);
  }

  private onVisibilityChange = () => {
    // Toggle pause when simulation not manually paused on visibility change
    if(!this.isPaused) {
      this.gpu.pause();
    }

    this.gpu.resetFrameData(); // prevent lag
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if(this.isLoading) return;

    if (e.code === 'Space') {
      e.preventDefault();
      this.pauseLoop();
    }
    if (e.code === 'KeyN') {
      this.stepOnce();
    }
    if (e.code === 'KeyR') {
      this.randomizeGrid();
    }
    if (e.code === 'Digit1') {
      this.noiseGenerator = 'white noise';
      console.log("Using white noise generator");
    }
    if (e.code === 'Digit2') {
      this.noiseGenerator = 'simplex';
      console.log("Using simplex noise generator");
    }
    if (e.code === 'Digit3') {
      this.noiseGenerator = 'fractal';
      console.log("Using fractal noise generator");
    }
    if (e.code === 'KeyC') {
      // TODO better implementation
      this.gpu.updateColors(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), 0);
    }
    if (e.code === 'KeyB') {
      // TODO better implementation
      this.gpu.updateColors(Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), -1);
    }
    if (e.code === 'ArrowUp') {
      this.gpu.directionsPressed[0] = true;
    }
    if (e.code === 'ArrowRight') {
      this.gpu.directionsPressed[1] = true;
    }
    if (e.code === 'ArrowDown') {
      this.gpu.directionsPressed[2] = true;
    }
        if (e.code === 'ArrowLeft') {
      this.gpu.directionsPressed[3] = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if(this.isLoading) return;

    if (e.code === 'ArrowUp') {
      this.gpu.directionsPressed[0] = false;
    }
    if (e.code === 'ArrowRight') {
      this.gpu.directionsPressed[1] = false;
    }
    if (e.code === 'ArrowDown') {
      this.gpu.directionsPressed[2] = false;
    }
    if (e.code === 'ArrowLeft') {
      this.gpu.directionsPressed[3] = false;
    }
  }

  private onScroll = (e: WheelEvent) => {
    if(this.isLoading) return;

    e.preventDefault();

    const zoomFactor = 1.1;

    const zoomMultiplier = e.deltaY < 0 ? zoomFactor : 1 / zoomFactor;

    this.zoomAtClientPoint(e.clientX, e.clientY, zoomMultiplier)
  };

  private onMouseDown = (e: MouseEvent) => {
    if(this.isLoading) return;

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
    if (!this.isDragging || this.isLoading ) return;

    const dx = (e.clientX - this.lastX) * this.dpr;
    const dy = (this.lastY - e.clientY) * this.dpr;

    this.lastX = e.clientX;
    this.lastY = e.clientY;

    this.gpu.cameraMove(dx, dy);
  };

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
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.floor(rect.width * this.dpr);
    const height = Math.floor(rect.height * this.dpr);
    if(this.canvas.width === width && this.canvas.height === height) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;

    this.gpu.resizeCanvas(width, height);
    this.gpu.renderFrame();
  }


}
