import { Injectable } from '@angular/core';

export interface CAConfiguration {
  birthMaskString: string;
  surviveMaskString: string;
  birthKernel: number[][];
  surviveKernel: number[][] | null;
  hasKernelWeights: boolean;
};

@Injectable({
  providedIn: 'root',
})
export class PresetConfigService {
  private MAX_NEIGHBORHOOD_SIZE = 15;

  private getEmptyKernel(): Array<Array<number>> {
    const kernel: Array<Array<number>> = [];

    for (let y = 0; y < this.MAX_NEIGHBORHOOD_SIZE; y++) {
      const row: number[] = [];
      for (let x = 0; x < this.MAX_NEIGHBORHOOD_SIZE; x++) {
        row.push(0);
      }
      kernel.push(row);
    }
    return kernel;
  }

  getConway(): CAConfiguration {
    const kernel = this.getEmptyKernel();
    // Set Ruleset strings
    const birthMaskString = '3';
    const surviveMaskString = '2-3';

    // Set kernels
    const center = Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2); 

    kernel[center + 1][center - 1] = 1; kernel[center + 1][center] = 1; kernel[center + 1][center + 1] = 1;
    kernel[center][center - 1] = 1;     kernel[center][center] = 0;     kernel[center][center + 1] = 1;
    kernel[center - 1][center - 1] = 1; kernel[center - 1][center] = 1; kernel[center - 1][center + 1] = 1;

    return {
      birthMaskString: birthMaskString,
      surviveMaskString: surviveMaskString,
      birthKernel: kernel,
      surviveKernel: null,
      hasKernelWeights: false
    }
  }

  getMaze(): CAConfiguration {
    const kernel = this.getEmptyKernel();
    // Set Ruleset strings
    const birthMaskString = '3';
    const surviveMaskString = '2-4';

    // Set kernels
    const center = Math.floor(this.MAX_NEIGHBORHOOD_SIZE / 2); 

    kernel[center + 1][center - 1] = 1; kernel[center + 1][center] = 1; kernel[center + 1][center + 1] = 1;
    kernel[center][center - 1] = 1;     kernel[center][center] = 0;     kernel[center][center + 1] = 1;
    kernel[center - 1][center - 1] = 1; kernel[center - 1][center] = 1; kernel[center - 1][center + 1] = 1;

    return {
      birthMaskString: birthMaskString,
      surviveMaskString: surviveMaskString,
      birthKernel: kernel,
      surviveKernel: null,
      hasKernelWeights: false
    }
  }

  getBugs(): CAConfiguration {
    // Set Ruleset strings
    const birthMaskString = '34-45';
    const surviveMaskString = '34-58';

    // Create kernels
    const birthKernel = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],     
    ];

    return {
      birthMaskString: birthMaskString,
      surviveMaskString: surviveMaskString,
      birthKernel: birthKernel,
      surviveKernel: null,
      hasKernelWeights: false
    }
  }

  getMitosis(): CAConfiguration {
    // Set Ruleset strings
    const birthMaskString = '8-17';
    const surviveMaskString = '12-24';

    // Create kernels
    const birthKernel = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],     
    ];

    const surviveKernel = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0],
      [0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0],
      [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 
    ];

    return {
      birthMaskString: birthMaskString,
      surviveMaskString: surviveMaskString,
      birthKernel: birthKernel,
      surviveKernel: surviveKernel,
      hasKernelWeights: false
    }
  }

  getAmoeba(): CAConfiguration {
    // Set Ruleset strings
    const birthMaskString = '41-51, 63-70';
    const surviveMaskString = '40-70';


    // Create kernels
    const birthKernel = [
      [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0],
      [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
      [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
      [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
      [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
      [0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], 
    ];

    return {
      birthMaskString: birthMaskString,
      surviveMaskString: surviveMaskString,
      birthKernel: birthKernel,
      surviveKernel: null,
      hasKernelWeights: true
    }
  }

  getGaussian(): CAConfiguration {
    // Set Ruleset strings
    const birthMaskString = '11-14';
    const surviveMaskString = '11-14, 16-22';

    // Create kernels
    const birthKernel = [
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 2, 4, 2, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 4, 8, 4, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 2, 4, 8, 0, 8, 4, 2, 1, 0, 0, 0],
      [0, 0, 0, 0, 1, 2, 4, 8, 4, 2, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1, 2, 4, 2, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],     
    ];

    return {
      birthMaskString: birthMaskString,
      surviveMaskString: surviveMaskString,
      birthKernel: birthKernel,
      surviveKernel: null,
      hasKernelWeights: true
    }
  }
  
}
