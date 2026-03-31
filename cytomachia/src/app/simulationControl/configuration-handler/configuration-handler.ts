import { 
  Component,
  AfterViewInit,
  ChangeDetectorRef
} from '@angular/core';
import { FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule, MatInput } from '@angular/material/input'; 
import { MatRadioModule} from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider'
import { SimulationService } from '../simulation-service';
import { filter, take } from 'rxjs/operators';

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

  }

  public updateNoiseGenerator(generator: string) {
    this.simulation.updateNoiseGenerator(generator);
  }

  public updateTargetFPS(value: number) {
    this.simulation.updateTargetFPS(value);
  }
}
