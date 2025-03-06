export const optimizeImageForOCR = (canvas: HTMLCanvasElement): string => {
  // Create a temporary canvas for image processing
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d')!;
  
  // Increase resolution for better text recognition
  const scaleFactor = 2.5; // Increased from 2.0 to 2.5 for better detail
  const width = canvas.width * scaleFactor;
  const height = canvas.height * scaleFactor;
  
  tempCanvas.width = width;
  tempCanvas.height = height;
  
  // Enable image smoothing for better scaling
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = 'high';
  
  // Draw the image with scaling
  tempCtx.drawImage(canvas, 0, 0, width, height);
  
  try {
    // Get the image data
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Create a copy of the original image data for comparison
    const originalData = new Uint8ClampedArray(data);
    
    // Calculate average brightness to determine document background
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    
    // Enhanced image processing with adaptive thresholding
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale using precise coefficients
      const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
      
      // Apply mild contrast enhancement (reduced from 1.2 to 1.1)
      const contrast = 1.1;
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      const enhancedGray = factor * (gray - 128) + 128;
      
      // Use adaptive thresholding based on document brightness
      // This helps preserve both bold and light text
      let threshold;
      if (avgBrightness > 200) {
        // Bright document (white background)
        threshold = 170; // Lower threshold to catch lighter text
      } else if (avgBrightness < 100) {
        // Dark document
        threshold = 120; // Higher threshold for dark backgrounds
      } else {
        // Normal document
        threshold = 150; // Balanced threshold
      }
      
      // Apply a more gradual thresholding for better text preservation
      let value;
      if (enhancedGray > threshold + 30) {
        // Definitely background
        value = 255;
      } else if (enhancedGray < threshold - 30) {
        // Definitely text
        value = 0;
      } else {
        // In the middle - use a more gradual approach to preserve details
        const normalizedGray = (enhancedGray - (threshold - 30)) / 60;
        value = Math.round(normalizedGray * 255);
      }
      
      // Set all channels to the same value
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    
    // Put the modified pixels back
    tempCtx.putImageData(imageData, 0, 0);
    
    // Create a second canvas for a different processing approach
    const secondCanvas = document.createElement('canvas');
    secondCanvas.width = width;
    secondCanvas.height = height;
    const secondCtx = secondCanvas.getContext('2d')!;
    
    // Apply a different processing technique focused on edge detection
    secondCtx.drawImage(canvas, 0, 0, width, height);
    const secondImageData = secondCtx.getImageData(0, 0, width, height);
    const secondData = secondImageData.data;
    
    // Simple edge detection to highlight text boundaries
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        
        // Get grayscale values of surrounding pixels
        const gray = 0.2989 * originalData[idx] + 0.5870 * originalData[idx + 1] + 0.1140 * originalData[idx + 2];
        
        // Simple Sobel edge detection
        const gx = 
          -1 * (0.2989 * originalData[idx - 4] + 0.5870 * originalData[idx - 3] + 0.1140 * originalData[idx - 2]) +
           1 * (0.2989 * originalData[idx + 4] + 0.5870 * originalData[idx + 5] + 0.1140 * originalData[idx + 6]);
        
        const gy = 
          -1 * (0.2989 * originalData[idx - width * 4] + 0.5870 * originalData[idx - width * 4 + 1] + 0.1140 * originalData[idx - width * 4 + 2]) +
           1 * (0.2989 * originalData[idx + width * 4] + 0.5870 * originalData[idx + width * 4 + 1] + 0.1140 * originalData[idx + width * 4 + 2]);
        
        // Calculate edge magnitude
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        
        // Highlight edges
        if (magnitude > 20) {
          secondData[idx] = secondData[idx + 1] = secondData[idx + 2] = 0; // Edge (black)
        } else {
          secondData[idx] = secondData[idx + 1] = secondData[idx + 2] = 255; // Non-edge (white)
        }
      }
    }
    
    secondCtx.putImageData(secondImageData, 0, 0);
    
    // Return the first processed image as it tends to work better for OCR
    // But the second approach is available if needed in the future
    return tempCanvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Image optimization failed, proceeding with unoptimized image', err);
    // Return original image if processing fails
    return canvas.toDataURL('image/png');
  }
}; 