import { 
  Component,
  AfterViewInit,
  OnDestroy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef
} from '@angular/core';
import { FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule} from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider'
import { SimulationService } from '../simulation-service';
import { debounceTime, distinctUntilChanged, filter, take } from 'rxjs/operators';
import iro from '@jaames/iro';
import { IroColorPicker } from '@jaames/iro/dist/ColorPicker';
import { IroColor } from '@irojs/iro-core/dist/color'
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-configuration-handler',
  imports: [
    MatRadioModule,
    ReactiveFormsModule,
    MatSliderModule,
    MatFormFieldModule,
    MatIconModule,
],
  templateUrl: './configuration-handler.html',
  styleUrl: './configuration-handler.scss',
})
export class ConfigurationHandler implements OnDestroy, AfterViewInit {
  constructor(
    private simulation: SimulationService,
    private changeDetector: ChangeDetectorRef,
  ) {}

  @ViewChild('backgroundColorPicker', { static: false }) backgroundColorPickerRef!: ElementRef<HTMLElement>;
  private backgroundColorPickerElement!: HTMLElement;
  private backgroundColorPicker!: IroColorPicker;
  public backgroundColorControl = new FormControl('#000000', [
    Validators.required,
    Validators.pattern(/^#([0-9A-F]{3}){1,2}$/i),
  ]);
  @ViewChild('foregroundColorPicker', { static: false }) foregroundColorPickerRef!: ElementRef<HTMLElement>;
  private foregroundColorPickerElement!: HTMLElement;
  private foregroundColorPicker!: IroColorPicker;
  public foregroundColorControl = new FormControl('#7fffff', [
    Validators.required,
    Validators.pattern(/^#([0-9A-F]{3}){1,2}$/i),
  ]);

  private masterSubscription: Subscription[] = [];

  public isSimulation: boolean = false;
  public noiseGeneratorControl = new FormControl('fractal', [
    Validators.required
  ]);
  public fpsControl = new FormControl(24, [
    Validators.required,
    Validators.min(0),
    Validators.max(244)
  ]);

  ngAfterViewInit() {
    this.simulation.isInit$.pipe(
      filter(value => value === true),
      take(1)
    ).subscribe(() => {
      this.isSimulation = true;
      this.changeDetector.detectChanges();
      // Wait for DOM update
      setTimeout(() => {
        this.init();
      });
    });
  }

  ngOnDestroy() {
    this.backgroundColorPicker!.off('input:end', this.updateBackgroundColor);
    this.foregroundColorPicker!.off('input:end', this.updateForegroundColor);
    this.masterSubscription.forEach(subsciption => {
      subsciption.unsubscribe();
    });
  }

  private init() {
    // Setup color pickers
    this.backgroundColorPickerElement = this.backgroundColorPickerRef.nativeElement;
    this.backgroundColorPicker = iro.ColorPicker(this.backgroundColorPickerElement, {
        width: 250,
        color: "#000000"
    });
    this.backgroundColorPicker.on('input:end', this.updateBackgroundColor);

    this.foregroundColorPickerElement = this.foregroundColorPickerRef.nativeElement;
    this.foregroundColorPicker = iro.ColorPicker(this.foregroundColorPickerElement, {
        width: 250,
        color: "#7FFFFF"
    });
    this.foregroundColorPicker.on('input:end', this.updateForegroundColor);

    // Color picker formcontrols
    this.masterSubscription.push(this.foregroundColorControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe(value => {
      this.updateColorsFromHex(value!, 1);
    }));
    this.masterSubscription.push(this.backgroundColorControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe(value => {
      this.updateColorsFromHex(value!, 0);
    }));
  }

  private updateBackgroundColor = (color: IroColor) => {
    const rgb = color.rgb;
    this.backgroundColorControl.setValue(color.hexString)
  }

  private updateForegroundColor = (color: IroColor) => {
    const rgb = color.rgb;
    this.foregroundColorControl.setValue(color.hexString)
  }

  private updateColorsFromHex(hex: string, index: number) {
    if (!hex || !/^#([0-9A-F]{3}){1,2}$/i.test(hex)) return;

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    this.simulation.updateColors(r, g, b, index);
    if (index === 0) {
      this.backgroundColorPicker.color.hexString = hex;
    }
    else {
      this.foregroundColorPicker.color.hexString = hex;
    }
  }

  public randomizeBackgroundColor() {
    let r = Math.floor(Math.random() * 256);
    let g = Math.floor(Math.random() * 256);
    let b = Math.floor(Math.random() * 256);
    // Updating formcontrol will update simulation and color picker
    this.backgroundColorControl.setValue(this.rgbToHex(r, g, b));
  }

  public randomizeForegroundColor() {
    let r = Math.floor(Math.random() * 256);
    let g = Math.floor(Math.random() * 256);
    let b = Math.floor(Math.random() * 256);
    // Updating formcontrol will update simulation and color picker
    this.foregroundColorControl.setValue(this.rgbToHex(r, g, b));
  }

  private rgbToHex(r: number, g: number, b: number) {
    const toHex = (c:number) => c.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  public updateNoiseGenerator(generator: string) {
    this.simulation.updateNoiseGenerator(generator);
  }

  public updateTargetFPS(value: number) {
    this.simulation.updateTargetFPS(value);
  }
}
