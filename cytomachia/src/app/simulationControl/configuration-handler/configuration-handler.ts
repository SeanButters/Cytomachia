import { 
  Component,
  AfterViewInit,
  OnDestroy,
  ChangeDetectorRef,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule} from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider'
import { SimulationService } from '../simulation-service';
import { PresetConfigService, CAConfiguration } from '../preset-config-service';
import { debounceTime, distinctUntilChanged, filter, take, timeout } from 'rxjs/operators';
import iro from '@jaames/iro';
import { IroColorPicker } from '@jaames/iro/dist/ColorPicker';
import { IroColor } from '@irojs/iro-core/dist/color'
import { Subscription } from 'rxjs';
import { MatTooltip } from "@angular/material/tooltip";

@Component({
  selector: 'app-configuration-handler',
  imports: [
    MatRadioModule,
    ReactiveFormsModule,
    MatSliderModule,
    MatFormFieldModule,
    MatIconModule,
    MatTooltip
],
  templateUrl: './configuration-handler.html',
  styleUrl: './configuration-handler.scss',
})
export class ConfigurationHandler implements OnDestroy, AfterViewInit {
  constructor(
    private simulation: SimulationService,
    private presets: PresetConfigService,
    private changeDetector: ChangeDetectorRef,
  ) {}

  private masterSubscription!: Subscription;
  public isSimulation: boolean = false;
  private MAX_NEIGHBORHOOD_SIZE = 15;

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
  public birthWeightCount = 8;
  public birthMask: boolean[] = [];
  public birthMaskControl = new FormControl('',[
    Validators.pattern(/^\s*\d+\s*(?:-\s*\d+)?\s*(?:,\s*\d+\s*(?:-\s*\d+)?\s*)*$/i)
  ]);
  public surviveWeightCount = 8;
  public surviveMask: boolean[] = [];
  public surviveMaskControl = new FormControl('',[
    Validators.pattern(/^\s*\d+\s*(?:-\s*\d+)?\s*(?:,\s*\d+\s*(?:-\s*\d+)?\s*)*$/i)
  ]);

  // Neighborhood inputs
  public isCombinedKernelControl = new FormControl(true);
  public isDetailedKernelViewControl = new FormControl(false);
  public birthKernel: Array<Array<number>> = [];
  public surviveKernel: Array<Array<number>> = [];
  public isEditingX: number = -1;
  public isEditingY: number = -1;
  public isEditingKernelRule: number = -1;
  public kernelValueControl = new FormControl('',
    Validators.pattern(/^[0-9]$/)
  )
  @ViewChild('kernelInput') kernelInputElement!: ElementRef;
  

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
    window.removeEventListener('keydown', this.handleKeyDown);
    this.masterSubscription.unsubscribe();
  }

  private init() {
    window.addEventListener('keydown', this.handleKeyDown);
    this.presetConway();

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
      if(this.checkMaskInput(value!, this.birthWeightCount)){
        this.stringToMask(value!, this.birthMask);
        this.simulation.updateRuleMasks(this.birthMask, 0);
      }
      else {
        console.log("Invalid input"); //TODO implement error bar
      }
    }));
    this.masterSubscription.add(this.surviveMaskControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged()
    ).subscribe(value => {
      if(this.checkMaskInput(value!, this.surviveWeightCount)){
        this.stringToMask(value!, this.surviveMask);
        this.simulation.updateRuleMasks(this.surviveMask, 1);
      }
      else {
        console.error("Invalid input"); //TODO implement error bar
      }
    }));
  }

  ///
  /// UI methods
  ///

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
          start = i + 1; // begin new range
        }
      } else {
        if (start !== null) {
          ranges.push(this.formatRange(start, i));
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
    if(!stringMask || stringMask === ''){
      mask.fill(false);
      this.changeDetector.detectChanges();
      return;
    }

    stringMask = stringMask.trim().replace(/,$/, "");
    mask.fill(false);

    const parts = stringMask.split(',');
    for (const part of parts) {
      if(part.includes('-')){
        const [min, max] = part.split('-').map(Number);
        for (let i = min; i < max + 1; i++) {
          mask[i - 1] = true;
        }
      }
      else {
        mask[Number(part) - 1] = true;
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

  private checkMaskRange(value: number, weightCount: number): boolean {
    return (value > 0 && value <= weightCount);
  }

  private checkMaskInput(input: string, weigthCount: number): boolean {
    if(!input || input === '') return true;
    input = input.trim().replace(/,$/, "");
    if (!/^\s*\d+\s*(?:-\s*\d+)?\s*(?:,\s*\d+\s*(?:-\s*\d+)?\s*)*$/i.test(input)) return false;
    const parts = input.split(',');

    for (const part of parts ) {
      if(part.includes('-')){
        const [min, max] = part.split('-').map(Number);
        if(min > max) return false;
        else {
          const a = this.checkMaskRange(min, weigthCount);
          const b = this.checkMaskRange(max, weigthCount);
          if (!(a && b)) return false;
        }
      }
      else{
        if(!this.checkMaskRange(Number(part), weigthCount)) return false;
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

  public backgroundColorBlur() {
    this.backgroundColorControl.setValue(this.backgroundColorPicker.color.hexString, { emitEvent: false });
  }

  public foregroundColorBlur() {
    this.foregroundColorControl.setValue(this.foregroundColorPicker.color.hexString, { emitEvent: false });
  }

  private updateMaskFromKernelChange(oldValue: number, newValue: number, rule: number){
    if (oldValue === newValue) return;

    const mask = rule === 0 ? this.birthMask : this.surviveMask;
    const chainedMask = rule === 0 && this.isCombinedKernelControl.value ? this.surviveMask : null;
    
    if(rule === 0) { // Use birth mask
      if(oldValue === 0) { // push mask
        this.birthWeightCount++;
        this.birthMask.push(false);
        if(this.isCombinedKernelControl.value) {
          this.surviveWeightCount++;
          this.surviveMask.push(false);
        }
      }
      else if (newValue === 0) { // pop mask + update simulation mask
        this.birthWeightCount -= 1;
        this.birthMask.pop();
        this.birthMaskControl.setValue(this.maskToString(this.birthMask), { emitEvent: false });
        this.simulation.updateRuleMasks(this.birthMask, 0);
        if(this.isCombinedKernelControl.value) {
          this.surviveWeightCount -= 1;
          this.surviveMask.pop();
          this.surviveMaskControl.setValue(this.maskToString(this.surviveMask), { emitEvent: false });
          this.simulation.updateRuleMasks(this.surviveMask, 1);
        }
      }
    } else { // use survive mask
      if(oldValue === 0) { // push mask
        this.surviveWeightCount++;
        this.surviveMask.push(false);
      }
      else if (newValue === 0) { // pop mask + update simulation mask
        this.surviveWeightCount -= 1;
        this.surviveMask.pop();
        this.surviveMaskControl.setValue(this.maskToString(this.surviveMask), { emitEvent: false });
        this.simulation.updateRuleMasks(this.surviveMask, 1);
      }
    }
  }

  public submitKernelControl(x: number, y: number, rule: number, removeIsEditing: boolean = true) {
    const center = Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2);
    if(x === center && y === center) return;

    if(this.kernelValueControl.value && /^[0-9]$/.test(this.kernelValueControl.value)) {
      const kernel = rule === 0 ? this.birthKernel : this.surviveKernel;
      const oldValue = kernel[y][x];
      const newValue = Number(this.kernelValueControl.value);
      

      if(oldValue != newValue) {
        kernel[y][x] = newValue;

        this.updateMaskFromKernelChange(oldValue, newValue, rule)

        this.simulation.updateKernels(kernel, rule);
        if(this.isCombinedKernelControl.value) this.simulation.updateKernels(this.surviveKernel, 1);
      }
    }

    if(removeIsEditing) {
      this.kernelValueControl.setValue('');
      this.isEditingX = -1;
      this.isEditingY = -1;    
      this.isEditingKernelRule = -1;
    }
  }

  public toggleKernelCell(x: number, y: number, rule: number) {
    const center = Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2);
    if(x === center && y === center) return;

    const kernel = rule === 0 ? this.birthKernel : this.surviveKernel;
    const oldValue = kernel[y][x];
    const newValue = oldValue === 1 ? 0 : 1;

    kernel[y][x] = newValue;

    this.updateMaskFromKernelChange(oldValue, newValue, rule)

    this.simulation.updateKernels(kernel, rule);
    if(this.isCombinedKernelControl.value) this.simulation.updateKernels(this.surviveKernel, 1);
  }

  public toggleEditKernelCell(x: number, y: number, rule: number) {
    const center = Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2);
    if(x === center && y === center) return;
    if( x > this.MAX_NEIGHBORHOOD_SIZE - 1 || y > this.MAX_NEIGHBORHOOD_SIZE - 1 || x < 0 || y < 0) return;

    this.isEditingKernelRule = rule;
    this.isEditingX = x;
    this.isEditingY = y;
    this.kernelValueControl.setValue(this.getKernelCellValue(x, y, rule));
    this.changeDetector.detectChanges();

    setTimeout(() => {
      this.kernelInputElement!.nativeElement.focus();
      this.kernelInputElement!.nativeElement.select();
    }, 50);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if(this.isEditingX > -1) {
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        this.submitKernelControl(this.isEditingX, this.isEditingY, this.isEditingKernelRule, false);
        this.toggleEditKernelCell(this.isEditingX, this.isEditingY - 1, this.isEditingKernelRule);
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.submitKernelControl(this.isEditingX, this.isEditingY, this.isEditingKernelRule, false);
        this.toggleEditKernelCell(this.isEditingX + 1, this.isEditingY, this.isEditingKernelRule);
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        this.submitKernelControl(this.isEditingX, this.isEditingY, this.isEditingKernelRule, false);
        this.toggleEditKernelCell(this.isEditingX, this.isEditingY + 1, this.isEditingKernelRule);
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.submitKernelControl(this.isEditingX, this.isEditingY, this.isEditingKernelRule, false);
        this.toggleEditKernelCell(this.isEditingX - 1, this.isEditingY, this.isEditingKernelRule);
      }
    }
  }

  public getKernelCellColor(x: number, y: number, rule: number): string {
    const center = Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2);
    if(x === center && y === center) return 'rgb(82, 82, 82)';

    const kernel = rule === 0 ? this.birthKernel : this.surviveKernel;
    const value = kernel[y][x]
    if(value === 0) return 'black'

    const hue = ((value - 1) / 8) * 120;

    return 'hsl('+hue+', 70%, 50%)';
  }

  public getKernelCellValue(x: number, y: number, rule: number): string {
    const center = Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2);
    if(x === center && y === center) return '';

    const kernel = rule === 0 ? this.birthKernel : this.surviveKernel;
    return kernel[y][x].toString();
  }

  public updateCombinedKernel() {
    if(!this.isCombinedKernelControl.value) {
      this.surviveKernel = this.copyKernel(this.birthKernel);
      this.kernelToMaskUpdate(1);
    } else {
      this.surviveKernel = this.birthKernel;
      this.kernelToMaskUpdate(1);
    }
  }

  public updateDetailedKernelView() {
    if(!this.isDetailedKernelViewControl.value) {
      for (let y = 0; y < this.MAX_NEIGHBORHOOD_SIZE; y++) {
        for (let x = 0; x < this.MAX_NEIGHBORHOOD_SIZE; x++) {
          if(this.birthKernel[y][x] > 1) this.birthKernel[y][x] = 1;
          if(this.surviveKernel[y][x] > 1) this.surviveKernel[y][x] = 1;
        }
      }
      this.simulation.updateKernels(this.birthKernel, 0);
      this.simulation.updateKernels(this.surviveKernel, 1);
    }
  }

  public updateNoiseGenerator(generator: string) {
    this.simulation.updateNoiseGenerator(generator);
  }

  public updateTargetFPS(value: number) {
    this.simulation.updateTargetFPS(value);
  }

  private kernelToMaskUpdate(rule: number){
    const kernel = rule === 0 ? this.birthKernel : this.surviveKernel;
    let kernelCount = 0;

    for (let y = 0; y <this.MAX_NEIGHBORHOOD_SIZE; y++){
      for (let x = 0; x < this.MAX_NEIGHBORHOOD_SIZE; x++){
        if(kernel[y][x] > 0) kernelCount++;
      }
    }

    if(rule === 0) {
      if(this.birthWeightCount < kernelCount) {
        for(let i = this.birthWeightCount; i < kernelCount; i++) {
          this.birthMask.push(false);
        }
        this.birthWeightCount = kernelCount;
        this.simulation.updateRuleMasks(this.birthMask, 0);
      }
      else {
        for(let i = kernelCount; i < this.birthWeightCount; i++) {
          this.birthMask.pop();
        }
        this.birthWeightCount = kernelCount;
        this.simulation.updateRuleMasks(this.birthMask, 0);        
      }

      if(this.isCombinedKernelControl.value) {
        if(this.surviveWeightCount < kernelCount) {
          for(let i = this.surviveWeightCount; i < kernelCount; i++) {
            this.surviveMask.push(false);
          }
          this.surviveWeightCount = kernelCount;
          this.simulation.updateRuleMasks(this.surviveMask, 1);
        }
        else {
          for(let i = kernelCount; i < this.surviveWeightCount; i++) {
            this.surviveMask.pop();
          }
          this.surviveWeightCount = kernelCount;
          this.simulation.updateRuleMasks(this.surviveMask, 1);        
        }
      }
    }
    else {
      if(this.surviveWeightCount < kernelCount) {
        for(let i = this.surviveWeightCount; i < kernelCount; i++) {
          this.surviveMask.push(false);
        }
        this.surviveWeightCount = kernelCount;
        this.simulation.updateRuleMasks(this.surviveMask, 1);
      }
      else {
        for(let i = kernelCount; i < this.surviveWeightCount; i++) {
          this.surviveMask.pop();
        }
        this.surviveWeightCount = kernelCount;
        this.simulation.updateRuleMasks(this.surviveMask, 1);        
      }
    }
  }

  public swapKernels() {
    const temp = this.copyKernel(this.birthKernel);
    this.birthKernel = this.surviveKernel;
    this.surviveKernel = temp;
    this.kernelToMaskUpdate(0);
    this.kernelToMaskUpdate(1);
    this.simulation.updateKernels(this.birthKernel, 0);
    this.simulation.updateKernels(this.surviveKernel, 1);
  }

  public copyToKernel(rule: number) {
    if (rule === 0) {
      this.birthKernel = this.copyKernel(this.surviveKernel);
      this.kernelToMaskUpdate(0);
      this.simulation.updateKernels(this.birthKernel, 0);
    }
    else {
      this.surviveKernel = this.copyKernel(this.birthKernel);
      this.kernelToMaskUpdate(1);
      this.simulation.updateKernels(this.surviveKernel, 1);
    }
  }


  ///
  /// Init presets
  ///

  private copyKernel(oKernel: Array<Array<number>>): Array<Array<number>> {
    // Copy values not addresses
    const newKernel: Array<Array<number>> = oKernel.map(row => [...row]);
    return newKernel;
  }

  private initPreset( preset: CAConfiguration) {
    // Init kernels
    this.isDetailedKernelViewControl.setValue(preset.hasKernelWeights);

    this.birthKernel  = preset.birthKernel;
    if (preset.surviveKernel != null) {
      this.surviveKernel = preset.surviveKernel;
      this.isCombinedKernelControl.setValue(false);
    }
    else {
      this.surviveKernel = this.birthKernel;
      this.isCombinedKernelControl.setValue(true);
    }
    //this.updateCombinedKernel();

    this.simulation.updateKernels(this.birthKernel, 0);
    this.simulation.updateKernels(this.surviveKernel, 1);

    // Count weights
    this.birthWeightCount = 0;
    this.surviveWeightCount = 0;
    for (let y = 0; y < this.MAX_NEIGHBORHOOD_SIZE; y++) {
      for (let x = 0; x < this.MAX_NEIGHBORHOOD_SIZE; x++) {
        if(this.birthKernel[y][x] > 0) this.birthWeightCount++;
        if(this.surviveKernel[y][x] > 0) this.surviveWeightCount++;
      }
    }

    // Init masks
    this.birthMask = new Array(this.birthWeightCount).fill(false);
    this.birthMaskControl.setValue(preset.birthMaskString);
    this.stringToMask(preset.birthMaskString, this.birthMask);
    this.simulation.updateRuleMasks(this.birthMask, 0);
  
    this.surviveMask = new Array(this.surviveWeightCount).fill(false);
    this.surviveMaskControl.setValue(preset.surviveMaskString);
    this.stringToMask(preset.surviveMaskString, this.surviveMask);
    this.simulation.updateRuleMasks(this.surviveMask, 1);


    this.changeDetector.detectChanges();
  }

  public presetConway() {
    const preset: CAConfiguration = this.presets.getConway();
    this.initPreset(preset);
  }

  public presetMaze() {
    const preset: CAConfiguration = this.presets.getMaze();
    this.initPreset(preset);
  }

  public presetGaussian() {
    const preset: CAConfiguration = this.presets.getGaussian();
    this.initPreset(preset);
  }

  public presetBugs() {
    const preset: CAConfiguration = this.presets.getBugs();
    this.initPreset(preset);
  }

  public presetMitosis() {
    const preset: CAConfiguration = this.presets.getMitosis();
    this.initPreset(preset);
  }

  public presetAmoeba() {
    const preset: CAConfiguration = this.presets.getAmoeba();
    this.initPreset(preset);
  }
}
