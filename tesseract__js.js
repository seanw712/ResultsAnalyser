function sanitizeForPostMessage(obj) {
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(sanitizeForPostMessage);
  if (typeof obj === "object") {
    const newObj = {};
    for (const key in obj) {
      if (typeof obj[key] !== "function") {
        newObj[key] = sanitizeForPostMessage(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

worker.postMessage(sanitizeForPostMessage({
  status: "recognizing text",
  // ... other serializable properties, e.g. data, progress if needed
})); 