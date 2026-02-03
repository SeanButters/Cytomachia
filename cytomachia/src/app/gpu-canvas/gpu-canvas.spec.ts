import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GpuCanvas } from './gpu-canvas';

describe('GpuCanvas', () => {
  let component: GpuCanvas;
  let fixture: ComponentFixture<GpuCanvas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GpuCanvas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GpuCanvas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
