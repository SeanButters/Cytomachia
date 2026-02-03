import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class WebGPUService {
  device!: GPUDevice;
  context!: GPUCanvasContext;
  adapter!: GPUAdapter | null;
  format!: GPUTextureFormat;
  encoder!: GPUCommandEncoder;

  async init(canvas: HTMLCanvasElement) {
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
    this.encoder = this.device.createCommandEncoder();
    this.context = canvas.getContext('webgpu') as GPUCanvasContext;

    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque',
    });
  }  
}
