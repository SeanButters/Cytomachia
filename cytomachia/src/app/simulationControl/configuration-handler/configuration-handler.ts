import { 
  Component,
  AfterViewInit,
  ChangeDetectorRef,
  ViewChild,
  ElementRef
} from '@angular/core';
import { FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input'; 
import { MatRadioModule} from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider'
import { SimulationService } from '../simulation-service';
import { filter, take } from 'rxjs/operators';
import iro from '@jaames/iro';

@Component({
  selector: 'app-configuration-handler',
  imports: [
    MatRadioModule,
    ReactiveFormsModule,
    MatSliderModule,
    MatFormFieldModule,
    MatInput
],
  templateUrl: './configuration-handler.html',
  styleUrl: './configuration-handler.scss',
})
export class ConfigurationHandler {
  constructor(
    private simulation: SimulationService,
    private changeDetector: ChangeDetectorRef,
  ) {}

  @ViewChild('backgroundColorPicker', { static: false }) backgroundColorPickerRef!: ElementRef<HTMLElement>;
  private backgroundColorPicker! : HTMLElement;

  public isSimulation: boolean = false;
  public noiseGeneratorControl = new FormControl('fractal', [
    Validators.required
  ]);
  public fpsControl = new FormControl('24', [
    Validators.required,
    Validators.min(0),
    Validators.max(244)
  ]);

  ngAfterViewInit() {
    this.simulation.isInit$.pipe(
      filter(value => value === true),
      take(1)
    ).subscribe(() => {
      this.init();
    });
  }

  private init() {
    this.isSimulation = true;
    this.changeDetector.detectChanges();

    this.backgroundColorPicker = this.backgroundColorPickerRef.nativeElement;
    var colorPicker = iro.ColorPicker(this.backgroundColorPicker, {
        // Set the size of the color picker
        width: 320,
        // Set the initial color to pure red
        color: "#f00"
    });
  }

  public updateNoiseGenerator(generator: string) {
    this.simulation.updateNoiseGenerator(generator);
  }

  public updateTargetFPS(value: number) {
    this.simulation.updateTargetFPS(value);
  }
}
