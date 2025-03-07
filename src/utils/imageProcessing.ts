export const optimizeImageForOCR = (canvas: HTMLCanvasElement): string => {
  // Create a temporary canvas for image processing
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d')!;
  
  // Increase resolution for better text recognition
  // For tables, a higher resolution helps preserve structure
  const scaleFactor = 3.0; // Increased from 2.5 to 3.0 for better detail in tables
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
      
      // Apply mild contrast enhancement (reduced for better table line preservation)
      const contrast = 1.05;
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      const enhancedGray = factor * (gray - 128) + 128;
      
      // Use adaptive thresholding based on document brightness
      // This helps preserve both bold and light text
      let threshold;
      if (avgBrightness > 200) {
        // Bright document (white background)
        threshold = 180; // Higher threshold to preserve table lines
      } else if (avgBrightness < 100) {
        // Dark document
        threshold = 120; // Higher threshold for dark backgrounds
      } else {
        // Normal document
        threshold = 160; // Balanced threshold
      }
      
      // Apply a more gradual thresholding for better text and line preservation
      let value;
      if (enhancedGray > threshold + 40) {
        // Definitely background
        value = 255;
      } else if (enhancedGray < threshold - 40) {
        // Definitely text or lines
        value = 0;
      } else {
        // In the middle - use a more gradual approach to preserve details
        const normalizedGray = (enhancedGray - (threshold - 40)) / 80;
        value = Math.round(normalizedGray * 255);
      }
      
      // Set all channels to the same value
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    
    // Put the modified pixels back
    tempCtx.putImageData(imageData, 0, 0);
    
    // Create a second canvas for line detection (important for tables)
    const lineCanvas = document.createElement('canvas');
    lineCanvas.width = width;
    lineCanvas.height = height;
    const lineCtx = lineCanvas.getContext('2d')!;
    
    // Draw original image
    lineCtx.drawImage(canvas, 0, 0, width, height);
    const lineImageData = lineCtx.getImageData(0, 0, width, height);
    const lineData = lineImageData.data;
    
    // Specialized processing to enhance horizontal and vertical lines (table structure)
    // This uses a modified Hough transform approach to detect lines
    
    // First pass: detect horizontal lines
    for (let y = 1; y < height - 1; y++) {
      let lineStart = -1;
      let lineLength = 0;
      
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const gray = 0.2989 * originalData[idx] + 0.5870 * originalData[idx + 1] + 0.1140 * originalData[idx + 2];
        
        // Check if this is a potential line pixel (dark)
        if (gray < 150) {
          if (lineStart === -1) {
            lineStart = x;
          }
          lineLength++;
        } else if (lineStart !== -1) {
          // We've reached the end of a potential line
          if (lineLength > width / 20) { // Only consider lines of significant length
            // Enhance this line by making it darker and slightly thicker
            for (let lx = lineStart; lx < lineStart + lineLength; lx++) {
              const lineIdx = (y * width + lx) * 4;
              lineData[lineIdx] = lineData[lineIdx + 1] = lineData[lineIdx + 2] = 0; // Make line black
              
              // Make line slightly thicker (1px above and below)
              if (y > 1) {
                const aboveIdx = ((y - 1) * width + lx) * 4;
                lineData[aboveIdx] = lineData[aboveIdx + 1] = lineData[aboveIdx + 2] = 0;
              }
              if (y < height - 2) {
                const belowIdx = ((y + 1) * width + lx) * 4;
                lineData[belowIdx] = lineData[belowIdx + 1] = lineData[belowIdx + 2] = 0;
              }
            }
          }
          lineStart = -1;
          lineLength = 0;
        }
      }
    }
    
    // Second pass: detect vertical lines
    for (let x = 1; x < width - 1; x++) {
      let lineStart = -1;
      let lineLength = 0;
      
      for (let y = 1; y < height - 1; y++) {
        const idx = (y * width + x) * 4;
        const gray = 0.2989 * originalData[idx] + 0.5870 * originalData[idx + 1] + 0.1140 * originalData[idx + 2];
        
        // Check if this is a potential line pixel (dark)
        if (gray < 150) {
          if (lineStart === -1) {
            lineStart = y;
          }
          lineLength++;
        } else if (lineStart !== -1) {
          // We've reached the end of a potential line
          if (lineLength > height / 20) { // Only consider lines of significant length
            // Enhance this line by making it darker and slightly thicker
            for (let ly = lineStart; ly < lineStart + lineLength; ly++) {
              const lineIdx = (ly * width + x) * 4;
              lineData[lineIdx] = lineData[lineIdx + 1] = lineData[lineIdx + 2] = 0; // Make line black
              
              // Make line slightly thicker (1px left and right)
              if (x > 1) {
                const leftIdx = (ly * width + (x - 1)) * 4;
                lineData[leftIdx] = lineData[leftIdx + 1] = lineData[leftIdx + 2] = 0;
              }
              if (x < width - 2) {
                const rightIdx = (ly * width + (x + 1)) * 4;
                lineData[rightIdx] = lineData[rightIdx + 1] = lineData[rightIdx + 2] = 0;
              }
            }
          }
          lineStart = -1;
          lineLength = 0;
        }
      }
    }
    
    lineCtx.putImageData(lineImageData, 0, 0);
    
    // Blend the two processed images (thresholded and line-enhanced)
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = width;
    finalCanvas.height = height;
    const finalCtx = finalCanvas.getContext('2d')!;
    
    // Draw the thresholded image first
    finalCtx.drawImage(tempCanvas, 0, 0);
    
    // Overlay the line-enhanced image with reduced opacity
    finalCtx.globalAlpha = 0.7;
    finalCtx.drawImage(lineCanvas, 0, 0);
    finalCtx.globalAlpha = 1.0;
    
    // Return the final processed image
    return finalCanvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Image optimization failed, proceeding with unoptimized image', err);
    // Return original image if processing fails
    return canvas.toDataURL('image/png');
  }
}; 