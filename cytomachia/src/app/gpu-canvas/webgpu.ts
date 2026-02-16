import { Injectable } from '@angular/core';

interface orderedPair {
  x: number,
  y: number
}

@Injectable({
  providedIn: 'root',
})
export class WebGPUService {

  ///
  /// Vars
  ///
  // WebGPU setup vars
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private adapter!: GPUAdapter | null;
  private format!: GPUTextureFormat;

  // Compute pipleine vars
  private stateBuffers: GPUBuffer[] = [];
  private pingpongIndex = 0;
  private kernelBuffer!: GPUBuffer;
  private computeBindGroups: GPUBindGroup[] =[];
  private computePipeline!: GPUComputePipeline;
  // Render pipeline vars
  private renderBindGroups: GPUBindGroup[] = [];
  private renderPipeline!: GPURenderPipeline;

  // Simulation constraints
  private cellSizeBytes = 4; // Num bytes per cell in memory (4 bytes for Int32)
  private gridWidth = 2560;
  private gridHeight = 1444;

  // Simulation loop state vars
  private animationId: number | null = null;
  private isRunning: boolean = false;
  private targetStepsPerSecond = 30; // Target FPS
  private lastFrameTime = 0;
  private stepAccumulator = 0;

  // Camera vars
  private cameraBuffer!: GPUBuffer;
  private cameraZoom = 4;
  private cameraOffset: orderedPair = {
    x: Math.floor((this.gridWidth / 2) - (this.gridWidth / (this.cameraZoom * 2))),
    y: Math.floor((this.gridHeight / 2) - (this.gridHeight / (this.cameraZoom * 2)))
  };
  private gridScaleFactor: orderedPair = {
    x: 1.0,
    y: 1.0
 };

  ///
  /// Public API methods
  ///
  // Initialization method, call after canvas element is in dom
  async init(canvas: HTMLCanvasElement) {
    // WebGPU setup
    if(!('gpu' in  navigator)) {
      console.error('WebGPU not supported');
      //TODO: Make error snackbar
      return;
    }

    this.adapter = await navigator.gpu.requestAdapter();
    if (!this.adapter) {
      console.error('No GPU adapter found');
      //TODO: Make error snackbar
      return;
    }

    this.device = await this.adapter.requestDevice();
    this.context = canvas.getContext('webgpu') as GPUCanvasContext;

    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
    });

    // Compute pipline init
    this.initStateBuffers();
    this.createCameraBuffer();
    this.randomizeGrid();
    this.createKernelBuffer();
    this.createComputePipeline();
    this.createBindGroup();
    // Render pipeline init
    this.createRenderPipeline();
    this.createRenderBindGroup();
  }

  // Call when freeing this service
  destroy() {
    // Stop simulation loop
    this.stop();

    // Release allocated memory
    this.stateBuffers.forEach((buffer) => buffer?.destroy());
    this.kernelBuffer?.destroy();
    this.cameraBuffer?.destroy();
    this.device?.destroy();

    // Clear references to webGPU variables
    this.context = undefined as any;
    this.device = undefined as any;
    this.stateBuffers = undefined as any;
    this.kernelBuffer = undefined as any;
    this.cameraBuffer = undefined as any;
    this.computePipeline = undefined as any;
    this.renderPipeline = undefined as any;
    this.computeBindGroups = undefined as any;
    this.renderBindGroups = undefined as any;
  }

  start() {
    if (this.isRunning) return;
    this.lastFrameTime = performance.now();
    this.isRunning = true;

    requestAnimationFrame(this.frame);
  }

  stop() {
    this.isRunning = false;

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  pause() {
    this.isRunning = !this.isRunning;
  }

  stepOnce(){
    if (!this.isRunning) {
      this.computeStep();
      this.renderFrame();
    }
  }

  // Pan camera
  cameraMove(dx: number, dy: number) {
    this.cameraOffset.x -= dx / (this.cameraZoom * this.gridScaleFactor.x)
    this.cameraOffset.y -= dy / (this.cameraZoom * this.gridScaleFactor.y)

    this.updateCameraBuffer();
  }

  // Directional zooming
  zoomAt(mouseX: number, mouseY: number, zoomMultiplier: number) {
    // Translate camera offset from old zoom
    const oldZoom = this.cameraZoom;
    const worldX = (mouseX / (oldZoom * this.gridScaleFactor.x)) + this.cameraOffset.x;
    const worldY = (mouseY / (oldZoom * this.gridScaleFactor.y)) + this.cameraOffset.y;
  
    // Calculate new camera offset based off new zoom
    this.cameraZoom = Math.max(0.1, Math.min(oldZoom * zoomMultiplier, 100));
    this.cameraOffset.x = worldX - (mouseX / (this.cameraZoom * this.gridScaleFactor.x));
    this.cameraOffset.y = worldY - (mouseY / (this.cameraZoom * this.gridScaleFactor.y));

    this.updateCameraBuffer();
  }

  // Update gride scale factor with canvas resize events
  resizeCanvas(canvasWidth: number, canvasHeight: number) {
    this.gridScaleFactor.x = canvasWidth / this.gridWidth;
    this.gridScaleFactor.y = canvasHeight / this.gridHeight;
  }

  // Randomize gridstate of simulation
  async randomizeGrid() {
    // Pause simulation loop
    const wasRunning = this.isRunning;
    this.isRunning = false;

    // Wait for GPU to finish work
    await this.device.queue.onSubmittedWorkDone();

    // Randomize array
    const newCells = new Uint32Array(this.gridWidth * this.gridHeight);
    for (let i = 0; i < newCells.length; i++) {
      newCells[i] = Math.random() > 0.5 ? 1 : 0;
    }

    // Update both buffers
    this.device.queue.writeBuffer(this.stateBuffers[0], 0, newCells);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, newCells);

    this.pingpongIndex = 0;  // Reset ping-pong index

    this.isRunning = wasRunning;
  }

  // Render the current simulation state
  renderFrame() {
    const encoder = this.device.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store',
        },
      ],
    });

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroups[this.pingpongIndex]);
    pass.draw(6); // fullscreen quad
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  ///
  /// Private Service methods
  ///
  private frame = (time: number) => {
    const delta = (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;

    if (this.isRunning) {
      const stepInterval = 1 / this.targetStepsPerSecond;
      this.stepAccumulator += delta;

      while (this.stepAccumulator >= stepInterval) {
        this.computeStep();
        this.stepAccumulator -= stepInterval;
      }
    }

    this.renderFrame();

    // Loop
    requestAnimationFrame(this.frame);
  };

  private computeStep() {
    const encoder = this.device.createCommandEncoder();

    const pass = encoder.beginComputePass();
    pass.setPipeline(this.computePipeline);
    pass.setBindGroup(0, this.computeBindGroups[this.pingpongIndex]);

    const workgroupSize = 8;
    const dispatchX = Math.ceil(this.gridWidth / workgroupSize);
    const dispatchY = Math.ceil(this.gridHeight / workgroupSize);

    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.end();

    this.device.queue.submit([encoder.finish()]);

    // Flip index
    this.pingpongIndex ^= 1;
  }

  private updateCameraBuffer() {
    const cameraData = new Float32Array([
      this.cameraZoom,
      this.cameraOffset.x,
      this.cameraOffset.y,
      0 // padding
    ]);

    this.device.queue.writeBuffer(
      this.cameraBuffer,
      0,
      cameraData
    );
  }

  ///
  /// Private Initialization Methods
  ///
  // Initialize ping pong state buffers
  private initStateBuffers () {
    const bufferSize = this.gridWidth * this.gridHeight * this.cellSizeBytes

    for (let i = 0; i < 2; i++) {
      this.stateBuffers.push(
        this.device.createBuffer({
          size: bufferSize,
          usage:
            GPUBufferUsage.STORAGE |
            GPUBufferUsage.COPY_DST |
            GPUBufferUsage.COPY_SRC,
        })
      );
    }
  }

  private createKernelBuffer() {
    this.kernelBuffer = this.device.createBuffer({
      size: 8, // 2 * 4 bytes (u32)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const gridData = new Uint32Array([
      this.gridWidth,
      this.gridHeight
    ]);

    this.device.queue.writeBuffer(
      this.kernelBuffer,
      0,
      gridData
    );
  }

  private createCameraBuffer() {
    this.cameraBuffer = this.device.createBuffer({
      size: 16, // 4 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.updateCameraBuffer();
  }

  private createComputePipeline() {
    const shaderModule = this.device.createShaderModule({
      code: `
struct Grid {
    width: u32,
    height: u32,
};

@group(0) @binding(0)
var<storage, read> inputCells: array<u32>;

@group(0) @binding(1)
var<storage, read_write> outputCells: array<u32>;

@group(0) @binding(2)
var<uniform> grid: Grid;

fn index(x: u32, y: u32) -> u32 {
    return y * grid.width + x;
}

fn getCell(x: i32, y: i32) -> u32 {
    let w = i32(grid.width);
    let h = i32(grid.height);

    // Wrap around edges (toroidal grid)
    let wrappedX = (x + w) % w;
    let wrappedY = (y + h) % h;

    return inputCells[index(u32(wrappedX), u32(wrappedY))];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {

    if (id.x >= grid.width || id.y >= grid.height) {
        return;
    }

    let x = i32(id.x);
    let y = i32(id.y);

    var neighborCount: u32 = 0u;

    // 8 neighbors
    for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
            if (ox == 0 && oy == 0) {
                continue;
            }
            neighborCount += getCell(x + ox, y + oy);
        }
    }

    let i = index(id.x, id.y);
    let current = inputCells[i];

    var next: u32 = 0u;

    if (current == 1u && (neighborCount == 2u || neighborCount == 3u)) {
        next = 1u;
    }

    if (current == 0u && neighborCount == 3u) {
        next = 1u;
    }

    outputCells[i] = next;
}

  `,
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
  }

  private createBindGroup() {
    const layout = this.computePipeline.getBindGroupLayout(0);

    this.computeBindGroups = [
      // A -> B
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[0] } },
          { binding: 1, resource: { buffer: this.stateBuffers[1] } },
          { binding: 2, resource: { buffer: this.kernelBuffer } }
        ],
      }),
      // B -> A
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] } },
          { binding: 1, resource: { buffer: this.stateBuffers[0] } },
          { binding: 2, resource: { buffer: this.kernelBuffer } }
        ],
      }),
    ];
  }

  private createRenderBindGroup() {
    const layout = this.renderPipeline.getBindGroupLayout(0);

    this.renderBindGroups = [
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[0] } },
          { binding: 1, resource: { buffer: this.cameraBuffer } },
        ],
      }),
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] } },
          { binding: 1, resource: { buffer: this.cameraBuffer } },
        ],
      }),
    ];
  }

  private createRenderPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: `
  struct Grid {
    width: u32,
    height: u32,
  };

  struct Camera {
    zoom: f32,
    offsetX: f32,
    offsetY: f32,
    _padding: f32,
  };

  @group(0) @binding(0)
  var<storage, read> state: array<u32>;

  @group(0) @binding(1)
  var<uniform> camera: Camera;

  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
  };

  @vertex
  fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 6>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>(-1.0,  1.0),
      vec2<f32>(-1.0,  1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>( 1.0,  1.0),
    );

    var out: VertexOutput;
    out.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);

    // Convert from [-1,1] to [0,1]
    out.uv = positions[vertexIndex] * 0.5 + vec2<f32>(0.5);

    return out;
  }

  @fragment
  fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let width = ${this.gridWidth}u;
    let height = ${this.gridHeight}u;
    
    // Calculate camera zoom + pan
    let worldX = ((in.uv.x * f32(width)) / camera.zoom) + camera.offsetX;
    let worldY = ((in.uv.y * f32(height)) / camera.zoom) + camera.offsetY;

    // Reject out of bounds values, negative values need to be compare in float before casting to u32
    if (worldX < 0.0 || worldY < 0.0 || worldX >= f32(width) || worldY >= f32(height)) {
      return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    
    // Convert float positions to u32 grid positions
    let x = u32(worldX);
    let y = u32(worldY);

    let index = y * width + x;
    let value = state[index];

    if (value == 1u) {
      return vec4<f32>(1.0, 1.0, 1.0, 1.0);
    }

    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }
  `,
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.format,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }
}
