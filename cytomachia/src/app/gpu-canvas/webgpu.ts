import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class WebGPUService {
  // WebGPU setup vars
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private adapter!: GPUAdapter | null;
  private format!: GPUTextureFormat;

  // Compute pipleine vars
  private stateBuffers: GPUBuffer[] = [];
  private pingpongIndex = 0;
  private computeBindGroups: GPUBindGroup[] =[];
  private computePipeline!: GPUComputePipeline;
  // Render pipeline vars
  private renderBindGroups: GPUBindGroup[] = [];
  private renderPipeline!: GPURenderPipeline;

  // Simulation constraints
  private cellSizeBytes = 4; // Num bytes per cell in memory (4 bytes for Int32)
  private gridWidth = 444;
  private gridHeight = 256;


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

    // Simulation setup
    // Compute init
    this.initStateBuffers();
    this.createComputePipeline();
    this.createBindGroup();
    // Render init
    this.createRenderPipeline();
    this.createRenderBindGroup();
  }

  // Call when freeing this service
  destroy() {
    // TODO stop loops
    // TODO release references

    // Release memory
    this.stateBuffers.forEach((buffer) => buffer?.destroy());
    this.device?.destroy();

    // Clear references
    this.context = undefined as any;
    this.device = undefined as any;
    this.stateBuffers = undefined as any;
    this.computePipeline = undefined as any;
    this.renderPipeline = undefined as any;
    this.computeBindGroups = undefined as any;
    this.renderBindGroups = undefined as any;
  }

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

  private createComputePipeline() {
    const shaderModule = this.device.createShaderModule({
      code: `
  struct Grid {
    width: u32,
    height: u32,
  };

  @group(0) @binding(0)
  var<storage, read> currentState: array<u32>;

  @group(0) @binding(1)
  var<storage, read_write> nextState: array<u32>;

  @compute @workgroup_size(8, 8)
  fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let width = ${this.gridWidth}u;
    let height = ${this.gridHeight}u;

    if (id.x >= width || id.y >= height) {
      return;
    }

    let index = id.y * width + id.x;

    let value = currentState[index];

    // Toggle 0 ↔ 1
    nextState[index] = 1u - value;
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
        ],
      }),
      // B -> A
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] } },
          { binding: 1, resource: { buffer: this.stateBuffers[0] } },
        ],
      }),
    ];
  }

  stepCompute() {
    console.log("hello!");
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

  private createRenderPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: `
  struct Grid {
    width: u32,
    height: u32,
  };

  @group(0) @binding(0)
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
    let width = ${this.gridWidth}u;
    let height = ${this.gridHeight}u;

    let x = u32(in.uv.x * f32(width));
    let y = u32(in.uv.y * f32(height));

    if (x >= width || y >= height) {
      return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }

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

  private createRenderBindGroup() {
    const layout = this.renderPipeline.getBindGroupLayout(0);

    this.renderBindGroups = [
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[0] } },
        ],
      }),
      this.device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.stateBuffers[1] } },
        ],
      }),
    ];
  }

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

  // TODO yoink this
  async clearTexture(clearColor = { r: 0, g: 0, b: 0, a: 1 }) {
    if (!this.device || !this.context) return;

    const texture = this.context.getCurrentTexture();
    const view = texture.createView();

    const encoder = this.device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: clearColor,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }
}
