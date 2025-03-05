export const optimizeImageForOCR = (canvas: HTMLCanvasElement): string => {
  // Create a temporary canvas for image processing
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d')!;
  
  // Increase resolution for better number recognition
  const scaleFactor = 2.0;
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
    
    // Enhanced image processing for better number recognition
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale using precise coefficients
      const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
      
      // Enhance contrast
      const contrast = 1.2;
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      const enhancedGray = factor * (gray - 128) + 128;
      
      // Adaptive thresholding
      const localThreshold = 180;
      const value = enhancedGray > localThreshold ? 255 : 0;
      
      // Set all channels to the same value
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    
    // Put the modified pixels back
    tempCtx.putImageData(imageData, 0, 0);
  } catch (err) {
    console.warn('Image optimization failed, proceeding with unoptimized image', err);
  }
  
  return tempCanvas.toDataURL('image/png');
}; 