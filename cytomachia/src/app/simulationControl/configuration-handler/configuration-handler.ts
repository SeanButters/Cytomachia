import { 
  Component,
  AfterViewInit,
  OnDestroy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
  input
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

  private masterSubscription!: Subscription;
  public isSimulation: boolean = false;
  private MAX_NEIGHBORHOOD_SIZE = 15;
  private BITMASK_LENGTH = Math.ceil(((this.MAX_NEIGHBORHOOD_SIZE ** 2) - 1) / 32);

  // Color Inputs
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

  // Simulation Configuration Inputs
  public noiseGeneratorControl = new FormControl('fractal', [
    Validators.required
  ]);
  public fpsControl = new FormControl(24, [
    Validators.required,
    Validators.min(0),
    Validators.max(244)
  ]);

  // Ruleset inputs
  public weightCount = 8;
  public birthMask: boolean[] = new Array(this.weightCount).fill(false);
  public birthMaskControl = new FormControl('3',[
    Validators.required,
    Validators.pattern(/^\s*\d+\s*(?:-\s*\d+)?\s*(?:,\s*\d+\s*(?:-\s*\d+)?\s*)*$/i)
  ]);
  public surviveMask: boolean[] = new Array(this.weightCount).fill(false);
  public surviveMaskControl = new FormControl('2-3',[
    Validators.required,
    Validators.pattern(/^\s*\d+\s*(?:-\s*\d+)?\s*(?:,\s*\d+\s*(?:-\s*\d+)?\s*)*$/i)
  ]);

  // Neighborhood inputs
  public isCombinedKernelControl = new FormControl(true);
  

  ngAfterViewInit() {
    this.masterSubscription = new Subscription();
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
    this.masterSubscription.unsubscribe();
  }

  private init() {
    this.birthMask[3] = true;
    this.surviveMask[2] = true;
    this.surviveMask[3] = true;
    this.changeDetector.detectChanges();

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
    this.masterSubscription.add(this.foregroundColorControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe(value => {
      this.updateColorsFromHex(value!, 1);
    }));
    this.masterSubscription.add(this.backgroundColorControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe(value => {
      this.updateColorsFromHex(value!, 0);
    }));

    // Ruleset masks formcontrol
    this.masterSubscription.add(this.birthMaskControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe(value => {
      if(this.checkMaskInput(value!)){
        this.stringToMask(value!, this.birthMask);
        this.simulation.updateRuleMasks(this.birthMask, 0);
      }
      else {
        console.log("Fail");
      }
    }));
    this.masterSubscription.add(this.surviveMaskControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe(value => {
      if(this.checkMaskInput(value!)){
        this.stringToMask(value!, this.surviveMask);
        this.simulation.updateRuleMasks(this.surviveMask, 1);
      }
      else {
        console.log("Fail");
      }
    }));
  }

  public toggleBirthMask (index: number) {
    this.toggleMask(this.birthMask, index);
    this.birthMaskToString();
    this.simulation.updateRuleMasks(this.birthMask, 0);
  }

  public toggleSurviveMask (index: number ) {
    this.toggleMask(this.surviveMask, index);
    this.surviveMaskToString();
    this.simulation.updateRuleMasks(this.surviveMask, 1);
  }

  private toggleMask(mask: boolean[], index: number){
    mask[index] = !mask[index];
  }

  private formatRange(min: number, max: number): string {
    return min === max ? `${min}` : `${min}-${max}`;
  }

  private maskToString(mask: boolean[]): string {
    const ranges: string[] = [];

    let start: number | null = null;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        if (start === null) {
          start = i; // begin new range
        }
      } else {
        if (start !== null) {
          ranges.push(this.formatRange(start, i - 1));
          start = null;
        }
      }
    }
    // handle case where mask ends with true
    if (start !== null) {
      ranges.push(this.formatRange(start, mask.length - 1));
    }

    return ranges.join(', ');
  }

  private stringToMask(stringMask: string, mask: boolean[]){
    stringMask = stringMask.trim().replace(/,$/, "");
    mask.fill(false);

    const parts = stringMask.split(',');
    for (const part of parts) {
      if(part.includes('-')){
        const [min, max] = part.split('-').map(Number);
        for (let i = min; i < max + 1; i++) {
          mask[i] = true;
        }
      }
      else {
        mask[Number(part)] = true;
      }
    }

    this.changeDetector.detectChanges();
  }

  public birthMaskToString() {
    const stringMask = this.maskToString(this.birthMask);
    this.birthMaskControl.setValue(stringMask, { emitEvent: false });
  }

  public surviveMaskToString() {
    const stringMask = this.maskToString(this.surviveMask);
    this.surviveMaskControl.setValue(stringMask, { emitEvent: false });
  }

  private checkMaskRange(value: number): boolean {
    return (value >= 0 && value <= this.weightCount);
  }

  private checkMaskInput(input: string): boolean {
    input = input.trim().replace(/,$/, "");
    if (!input || !/^\s*\d+\s*(?:-\s*\d+)?\s*(?:,\s*\d+\s*(?:-\s*\d+)?\s*)*$/i.test(input)) return false;
    const parts = input.split(',');

    for (const part of parts ) {
      if(part.includes('-')){
        const [min, max] = part.split('-').map(Number);
        if(min > max) return false;
        else {
          const a = this.checkMaskRange(min);
          const b = this.checkMaskRange(max);
          if (!(a && b)) return false;
        }
      }
      else{
        if(!this.checkMaskRange(Number(part))) return false;
      }
    }
    return true;
  }

  private updateBackgroundColor = (color: IroColor) => {
    const rgb = color.rgb;
    this.backgroundColorControl.setValue(color.hexString);
  }

  private updateForegroundColor = (color: IroColor) => {
    const rgb = color.rgb;
    this.foregroundColorControl.setValue(color.hexString);
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

  public randomizeAllColors() {
    this.randomizeForegroundColor();
    this.randomizeBackgroundColor();
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
