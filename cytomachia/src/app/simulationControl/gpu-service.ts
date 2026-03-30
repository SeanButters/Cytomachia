import { Injectable } from '@angular/core';
import { createNoise4D } from "simplex-noise";
import { Observable, BehaviorSubject } from 'rxjs';

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

  // Buffer vars
  private gridParamsBuffer!: GPUBuffer;
  private stateBuffers: GPUBuffer[] = [];
  private pingpongIndex = 0;
  private rulesBuffer!: GPUBuffer; //[] = []; //TODO for multiple rulesets
  private bNeighborhoodBuffer!: GPUBuffer;
  private sNeighborhoodBuffer!: GPUBuffer;
  //private rulsetIndex = 0;
  private colorBuffer!: GPUBuffer;

  // Compute pipleine vars
  private computePipeline!: GPUComputePipeline;
  private computePingPongBindGroup: GPUBindGroup[] =[];
  private computeParamsBindGroup!: GPUBindGroup;
  private rulesetBindGroup!: GPUBindGroup; //[] = [];
  // Render pipeline vars
  private renderPipeline!: GPURenderPipeline;
  private renderPingPongBindGroup: GPUBindGroup[] = [];
  private renderParamsBindGroup!: GPUBindGroup;

  // Simulation constraints
  private cellSizeBytes = 4; // Num bytes per cell in memory (4 bytes for Int32)
  private gridSize: orderedPair = { x: 2560, y: 1444 };
  private MAX_RULESETS = 1;
  private MAX_NEIGHBORHOOD_SIZE = 15;
  private BITMASK_LENGTH = Math.ceil(((this.MAX_NEIGHBORHOOD_SIZE ** 2) - 1) / 32);

  // Simulation loop state vars
  private animationId: number | null = null;
  private isRunning: boolean = false;
  private isLoading = new BehaviorSubject<boolean>(true);
  public isLoadingObservable: Observable<boolean> = this.isLoading.asObservable();
  private targetStepsPerSecond = 24; // Target FPS
  private lastFrameTime = 0;
  private computeStepAccumulator = 0;
  private inputStepAccumulator = 0;
  public directionsPressed = [false, false, false, false]; // Up, Right, Down, Left

  // Camera vars
  private cameraBuffer!: GPUBuffer;
  private cameraZoom = 4;
  private cameraOffset: orderedPair = {
    x: Math.floor((this.gridSize.x / 2) - (this.gridSize.x / (this.cameraZoom * 2))),
    y: Math.floor((this.gridSize.y / 2) - (this.gridSize.y / (this.cameraZoom * 2)))
  };
  private gridScaleFactor: orderedPair = { x: 1.0, y: 1.0 };

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

    // Create buffers in memory
    this.createBuffers();

    // Compute pipline init
    await this.randomizeGrid('fractal');
    this.createComputePipeline();
    this.createComputeBindGroups();
    // Render pipeline init
    this.createRenderPipeline();
    this.createRenderBindGroup();
  }

  // Call when freeing this service
  destroy() {
    // Stop simulation loop
    this.stop();

    // Release allocated memory
    this.stateBuffers.forEach((buffer) => {
      buffer?.destroy();
      buffer = undefined as any;
    });
    // this.rulesetsBuffers.forEach((buffer) => {
    //   buffer?.destroy();
    //   buffer = undefined as any;
    // });
    this.rulesBuffer?.destroy();
    this.bNeighborhoodBuffer?.destroy();
    this.sNeighborhoodBuffer?.destroy();
    this.gridParamsBuffer?.destroy();
    this.cameraBuffer?.destroy();
    this.colorBuffer?.destroy();
    this.device?.destroy();

    // Clear references to webGPU variables
    this.context = undefined as any;
    this.device = undefined as any;
    this.stateBuffers = undefined as any;
    this.gridParamsBuffer = undefined as any;
    //this.rulesetsBuffers = undefined as any;
    this.rulesBuffer = undefined as any;
    this.bNeighborhoodBuffer = undefined as any;
    this.sNeighborhoodBuffer = undefined as any;
    this.cameraBuffer = undefined as any;
    this.colorBuffer = undefined as any;
    this.computePipeline = undefined as any;
    this.computePingPongBindGroup = undefined as any;
    this.computeParamsBindGroup = undefined as any;
    this.rulesetBindGroup = undefined as any;
    this.renderPipeline = undefined as any;
    this.renderPingPongBindGroup = undefined as any;
    this.renderParamsBindGroup = undefined as any;
  }

  start(startPaused: boolean) {
    if (this.isRunning) return;
    this.lastFrameTime = performance.now();
    this.isRunning = !startPaused;

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

  resetFrameData() {
    this.lastFrameTime = performance.now();
    this.computeStepAccumulator = 0;
    this.inputStepAccumulator = 0;
  }

  // Pan camera
  cameraMove(dx: number, dy: number) {
    this.cameraOffset.x -= dx / (this.cameraZoom * this.gridScaleFactor.x);
    this.cameraOffset.y -= dy / (this.cameraZoom * this.gridScaleFactor.y);

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
    this.gridScaleFactor.x = canvasWidth / this.gridSize.x;
    this.gridScaleFactor.y = canvasHeight / this.gridSize.y;
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
    pass.setBindGroup(0, this.renderParamsBindGroup);
    pass.setBindGroup(1, this.renderPingPongBindGroup[this.pingpongIndex]);
    pass.draw(6); // fullscreen quad
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  // Randomize gridstate of simulation
  async randomizeGrid(method: string) {
    this.isLoading.next(true);
    // Pause simulation loop
    const wasRunning = this.isRunning;
    this.isRunning = false;

    // Wait for GPU to finish work
    await this.device.queue.onSubmittedWorkDone();

    // Randomize array
    const newCells = new Uint32Array(this.gridSize.x * this.gridSize.y);

    if (method === 'fractal') {
      this.fractalNoise(newCells);
    }
    else if (method === 'simplex') {
      this.simplexNoise(newCells);
    }
    else {
      this.whiteNoise(newCells);
    }

    // Update both buffers
    this.device.queue.writeBuffer(this.stateBuffers[0], 0, newCells);
    this.device.queue.writeBuffer(this.stateBuffers[1], 0, newCells);

    this.pingpongIndex = 0;  // Reset ping-pong index

    this.isRunning = wasRunning;
    this.isLoading.next(false);
  }

  ///
  /// Private Service methods
  ///
  private frame = (time: number) => {
    const delta = (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;

    this.updateState(delta);

    this.handleInput(delta);

    this.renderFrame();

    // Loop
    requestAnimationFrame(this.frame);
  };

  private updateState(delta: number) {
    if (this.isRunning) {
      const stepInterval = 1 / this.targetStepsPerSecond;
      this.computeStepAccumulator += delta;

      while (this.computeStepAccumulator >= stepInterval) {
        this.computeStep();
        this.computeStepAccumulator -= stepInterval;
      }
    }
  }

  private computeStep() {
    const encoder = this.device.createCommandEncoder();

    const pass = encoder.beginComputePass();
    pass.setPipeline(this.computePipeline);
    pass.setBindGroup(0, this.computeParamsBindGroup);
    pass.setBindGroup(1, this.computePingPongBindGroup[this.pingpongIndex]);
    pass.setBindGroup(2, this.rulesetBindGroup);

    const workgroupSize = 8;
    const dispatchX = Math.ceil(this.gridSize.x / workgroupSize);
    const dispatchY = Math.ceil(this.gridSize.y / workgroupSize);

    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.end();

    this.device.queue.submit([encoder.finish()]);

    // Flip index
    this.pingpongIndex ^= 1;
  }

  // Handle user input
  private handleInput(delta: number) {

    const stepInterval = 1 / 30 //30fps;
    this.inputStepAccumulator += delta;
    const speed = 15;

    while (this.inputStepAccumulator >= stepInterval) {
      this.inputStepAccumulator -= stepInterval;
      this.handleDirectionInput();
    } 
  }

  // Handle camera movment based on diretion input
  private handleDirectionInput() {
    const speed = 15;
  
    let dx = 0;
    let dy = 0;

    // directionsPressed: [up, right, down, left]
    if (this.directionsPressed[0]) dy -= 1;
    if (this.directionsPressed[1]) dx -= 1;
    if (this.directionsPressed[2]) dy += 1;
    if (this.directionsPressed[3]) dx += 1;

    if(dx === 0 && dy === 0) {
      return;
    }

    const length = Math.hypot(dx, dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }

    dx *= speed;
    dy *= speed;

    this.cameraMove(Math.floor(dx), Math.floor(dy));
  }

  private index(x: number, y: number, width: number ): number {
    return (y * width) + x;
  }

  private updateNeighborhoodBuffer(index: number, rule: number) {
    const kernelArea = this.MAX_NEIGHBORHOOD_SIZE ** 2;
    const buffer = new ArrayBuffer((kernelArea + 1) * 4);
    const kernel = new Uint32Array(this.MAX_NEIGHBORHOOD_SIZE ** 2);
    let weightCount = 0;
    let weightSum = 0;

    const center: orderedPair = { 
      x: Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2),
      y: Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2) 
    }

    kernel[this.index(center.x - 1, center.y + 1, this.MAX_NEIGHBORHOOD_SIZE)] = 1; kernel[this.index(center.x, center.y + 1, this.MAX_NEIGHBORHOOD_SIZE)] = 1; kernel[this.index(center.x + 1, center.y + 1, this.MAX_NEIGHBORHOOD_SIZE)] = 1;
    kernel[this.index(center.x - 1, center.y, this.MAX_NEIGHBORHOOD_SIZE)] = 1;     kernel[this.index(center.x, center.y, this.MAX_NEIGHBORHOOD_SIZE)] = 0;     kernel[this.index(center.x + 1, center.y, this.MAX_NEIGHBORHOOD_SIZE)] = 1;
    kernel[this.index(center.x - 1, center.y - 1, this.MAX_NEIGHBORHOOD_SIZE)] = 1; kernel[this.index(center.x, center.y - 1, this.MAX_NEIGHBORHOOD_SIZE)] = 1; kernel[this.index(center.x + 1, center.y - 1, this.MAX_NEIGHBORHOOD_SIZE)] = 1;

    for(const weight of kernel){
      if (weight > 0) weightCount++;
      weightSum += weight;
    }

    const scale = weightCount/weightSum;

    new Uint32Array(buffer, 0, kernelArea).set(kernel);
    new Float32Array(buffer, kernelArea * 4, 1)[0] = scale;

    if(rule === 0) this.device.queue.writeBuffer(this.bNeighborhoodBuffer, 0, buffer);
    else if (rule === 1) this.device.queue.writeBuffer(this.sNeighborhoodBuffer, 0, buffer);
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

  public updateColors(r: number, g: number, b: number, index: number) {
    // Convert from 256 base values to 0->1.0 floats
    const colorData = new Float32Array([
      Math.max(0.0, Math.min(r / 255.0, 1.0)),
      Math.max(0.0, Math.min(g / 255.0, 1.0)),
      Math.max(0.0, Math.min(b / 255.0, 1.0)),
      1.0
    ]);
    console.log(r, g, b);

    this.device.queue.writeBuffer(
      this.colorBuffer,
      (index + 1) * 16, // 4 values * 4 bytes
      colorData
    );
  }

  private whiteNoise (cells: Uint32Array) {
    for (let i = 0; i < cells.length; i++) {
      const temp = Math.floor(Math.random() * 10);
      cells[i] = temp > 1 ? 0 : temp;
    }
  }

  private simplexNoise (cells: Uint32Array) {
    const noise = createNoise4D();

    for (let y = 0; y < this.gridSize.y; y++) {
      for (let x = 0; x < this.gridSize.x; x++) {
        const i = y * this.gridSize.x + x;

        const scale = 4;
        const nx = x / this.gridSize.x
        const ny = y / this.gridSize.y;

        // Map to torus
        const angleX = nx * Math.PI * 2;
        const angleY = ny * Math.PI * 2;

        const nx_cos = Math.cos(angleX) * scale;
        const nx_sin = Math.sin(angleX) * scale;
        const ny_cos = Math.cos(angleY) * scale;
        const ny_sin = Math.sin(angleY) * scale;

        const n = noise(nx_cos, nx_sin, ny_cos, ny_sin);

        cells[i] = Math.floor((n + 1) * 0.5 * (this.MAX_RULESETS + 1));
      }
    }
  }
  
  private fractalNoise (cells: Uint32Array) {
    const noise = createNoise4D();

    for (let y = 0; y < this.gridSize.y; y++) {
      for (let x = 0; x < this.gridSize.x; x++) {
        let value = 0;
        const i = y * this.gridSize.x + x;
        let amp = 1;
        const rounds = 4;
        let scale = 3;

        for (let o = 0; o < rounds; o++) {
          const nx = x / this.gridSize.x;
          const ny = y / this.gridSize.y;
          
          // Map to torus
          const angleX = nx * Math.PI * 2;
          const angleY = ny * Math.PI * 2;

          value += noise(
            Math.cos(angleX) * scale + 10,
            Math.sin(angleX) * scale + 20,
            Math.cos(angleY) * scale + 30,
            Math.sin(angleY) * scale + 40
          ) * amp;

          amp *= 0.5;
          scale  *= 2;
        }

        value /= 2 - (1.0 / Math.pow(2, rounds - 1)); // normalize 

        const n = Math.floor((value + 1) * 0.5 * (this.MAX_RULESETS + 1)); 
        cells[i] = n;
      }
    }
  }

  ///
  /// Private Initialization Methods
  ///
  private createComputePipeline() {
    const shaderModule = this.device.createShaderModule({
      code: `

  // Buffer inputs
  struct Grid {
    width: u32,
    height: u32,
    kernelSize: u32,
    _padding: u32
  };

  struct AutomataRules {
    birthMask: array<u32,${this.BITMASK_LENGTH}>, // Match bitmask size to square of kernel size
    surviveMask: array<u32,${this.BITMASK_LENGTH}>,
    value: u32,
  }

  struct Neighborhood {
    kernel: array<u32,${this.MAX_NEIGHBORHOOD_SIZE ** 2}>,
    scale: f32
  }

  @group(0) @binding(0)
  var<uniform> grid: Grid;

  @group(1) @binding(0)
  var<storage, read> inputCells: array<u32>;

  @group(1) @binding(1)
  var<storage, read_write> outputCells: array<u32>;

  @group(2) @binding(0)
  var<storage, read> rules: AutomataRules;

  @group(2) @binding(1)
  var<storage, read> birthNeighborhood: Neighborhood;

  @group(2) @binding(2)
  var<storage, read> surviveNeighborhood: Neighborhood;


  // Helper functions

  fn index(x: u32, y: u32) -> u32 {
    return y * grid.width + x;
  }

  fn checkCell(x: i32, y: i32) -> bool {
    let w = i32(grid.width);
    let h = i32(grid.height);

    // Wrap around edges (toroidal grid)
    let wrappedX = (x + w) % w;
    let wrappedY = (y + h) % h;

    let cellValue = inputCells[index(u32(wrappedX), u32(wrappedY))];

    return (cellValue == rules.value);
  }

  fn checkBitmask(mask: array<u32,${this.BITMASK_LENGTH}>, value: u32) -> bool {
    let word = value >> 5u;       // divide by 32
    let bit  = value & 31u;       // mod 32
    return (mask[word] & (1u << bit)) != 0u;
  }

  fn countNeighbors(neighborhood: Neighborhood, x: i32, y: i32) -> u32 {
    var neighborCount: u32 = 0u;
    let offset: i32 = i32(grid.kernelSize >> 1u);

    for (var oy = 0u; oy < grid.kernelSize; oy++) {
      for (var ox = 0u; ox < grid.kernelSize; ox++) {
        let ki = oy * grid.kernelSize + ox;
        let weight = neighborhood.kernel[ki];

        if (weight != 0u) {
          let nx = x + i32(ox) - offset;
          let ny = y + i32(oy) - offset;

          if (checkCell(nx,ny)) {
            neighborCount += weight;
          }
        }
      }
    }

    return u32(f32(neighborCount) * neighborhood.scale);
  }

  // Compute shader

  @compute @workgroup_size(8, 8)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {

    if (id.x >= grid.width || id.y >= grid.height) {
      return;
    }

    let x = i32(id.x);
    let y = i32(id.y);
    let i = index(id.x, id.y);
    let current = inputCells[i];

    var neighborCount: u32 = 0u;
    
    // Check birth neighborhood/rule
    if (current == 0u) {
      let neighborCount = countNeighbors(birthNeighborhood, x, y);

      if(checkBitmask(rules.birthMask, neighborCount)) {
        outputCells[i] = rules.value;
      }
      else {
        outputCells[i] = 0u;
      }
    }
    // Check survive neighborhood/rule
    else if (current == rules.value) {
      let neighborCount = countNeighbors(surviveNeighborhood, x, y);

      if(checkBitmask(rules.surviveMask, neighborCount)) {
        outputCells[i] = rules.value;
      }
      else {
        outputCells[i] = 0u;
      }
    }
    else {
      outputCells[i] = current;
    }
    return;
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

  private createComputeBindGroups() {
    const layout0 = this.computePipeline.getBindGroupLayout(0);
    const layout1 = this.computePipeline.getBindGroupLayout(1);
    const layout2 = this.computePipeline.getBindGroupLayout(2);

    // Create params bind group
    this.computeParamsBindGroup = this.device.createBindGroup({
      layout: layout0,
      entries: [
        { binding: 0, resource: { buffer: this.gridParamsBuffer }},
      ]
    });

    // Create bind groups for ping pong buffer
    this.computePingPongBindGroup = [
      // A -> B
      this.device.createBindGroup({
        layout: layout1,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[0] }},
          { binding: 1, resource: { buffer: this.stateBuffers[1] }},
        ],
      }),
      // B -> A
      this.device.createBindGroup({
        layout: layout1,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] }},
          { binding: 1, resource: { buffer: this.stateBuffers[0] }},
        ],
      }),
    ];

    // Create ruleset bind group
    this.rulesetBindGroup = this.device.createBindGroup({
      layout: layout2,
      entries: [
        { binding: 0, resource: { buffer: this.rulesBuffer } },
        { binding: 1, resource: { buffer: this.bNeighborhoodBuffer } },
        { binding: 2, resource: { buffer: this.sNeighborhoodBuffer } },
      ]
    });
  }

  private createRenderPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: `

  struct Grid {
    width: u32,
    height: u32,
    kernel_size: u32,
    _padding: u32
  };

  struct Camera {
    zoom: f32,
    offsetX: f32,
    offsetY: f32,
    _padding: f32,
  };

  @group(0) @binding(0)
  var<uniform> grid: Grid;

  @group(0) @binding(1)
  var<uniform> camera: Camera;

  @group(0) @binding(2)
  var<uniform> colors: array<vec4<f32>,${this.MAX_RULESETS + 1}>;

  @group(1) @binding(0)
  var<storage, read> state: array<u32>;

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
    let f32width = f32(grid.width);
    let f32height = f32(grid.height);

    // Calculate camera zoom + pan
    let worldX = ((in.uv.x * f32width) / camera.zoom) + camera.offsetX;
    let worldY = ((in.uv.y * f32height) / camera.zoom) + camera.offsetY;
    
    // Calculate toroidal wrap
    let wrappedX = worldX - floor(worldX / f32width) * f32width;
    let wrappedY = worldY - floor(worldY / f32height) * f32height;

    let x = u32(wrappedX);
    let y = u32(wrappedY);

    let index = y * grid.width + x;
    let value = state[index];

    return colors[value];
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

  private createRenderBindGroup() {
    const layout0 = this.renderPipeline.getBindGroupLayout(0);
    const layout1 = this.renderPipeline.getBindGroupLayout(1);

    // Create params bind group
    this.renderParamsBindGroup = this.device.createBindGroup({
      layout: layout0,
      entries: [
        { binding: 0, resource: { buffer: this.gridParamsBuffer }},
        { binding: 1, resource: { buffer: this.cameraBuffer }},
        { binding: 2, resource: { buffer: this.colorBuffer }}
      ]
    });

    // Create bindgroups for ping pong buffer
    this.renderPingPongBindGroup = [
      this.device.createBindGroup({
        layout: layout1,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[0] }},
        ],
      }),
      this.device.createBindGroup({
        layout: layout1,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] } },
        ],
      }),
    ];
  }

  private createBuffers() {
      this.createGridParamsBuffer();
      this.createPingPongStateBuffers();
      this.createRulesetBuffers();
      this.createCameraBuffer();
      this.createColorBuffer();
  }

  // Initialize ping pong state buffers
  private createPingPongStateBuffers() {
    const bufferSize = this.gridSize.x * this.gridSize.y * this.cellSizeBytes;

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

  private createGridParamsBuffer() {
    this.gridParamsBuffer = this.device.createBuffer({
      size: 16, // 4 * 4 bytes (u32)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const gridData = new Uint32Array([
      this.gridSize.x,
      this.gridSize.y,
      this.MAX_NEIGHBORHOOD_SIZE,
      0 // padding
    ]);

    this.device.queue.writeBuffer(
      this.gridParamsBuffer,
      0,
      gridData
    );
  }

  private createRulesetBuffers() {
    this.rulesBuffer = this.device.createBuffer({
      size: ((this.BITMASK_LENGTH * 2) + 1) * 4 , // 2 bitmasks + 1 u32 * 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const rules = new Uint32Array((this.BITMASK_LENGTH * 2) + 1);
    // Birth: 3 neighbors
    rules[0] |= (1 << 3);
    // Survive: 2 or 3 neighbors
    rules[this.BITMASK_LENGTH] |= (1 << 2);
    rules[this.BITMASK_LENGTH] |= (1 << 3);
    rules[this.BITMASK_LENGTH * 2] = 1;
    this.device.queue.writeBuffer(
      this.rulesBuffer,
      0,
      rules
    );

    this.bNeighborhoodBuffer = this.device.createBuffer({
      size: ((this.MAX_NEIGHBORHOOD_SIZE ** 2) + 1) * 4, // Kernel + 1 float * 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.updateNeighborhoodBuffer(0, 0);

    this.sNeighborhoodBuffer = this.device.createBuffer({
      size: ((this.MAX_NEIGHBORHOOD_SIZE ** 2) + 1) * 4, // Kernel + 1 float * 4 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.updateNeighborhoodBuffer(0, 1);
  }

  private createCameraBuffer() {
    this.cameraBuffer = this.device.createBuffer({
      size: 16, // 4 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.updateCameraBuffer();
  }

  private createColorBuffer() {
    this.colorBuffer = this.device.createBuffer({
      size: (this.MAX_RULESETS + 1) * 16, // 4 * 4 byte floats r,g,b,a
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.updateColors(0, 0, 0, -1);
    this.updateColors(128, 255, 255, 0);
  }

}
