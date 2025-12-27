const chunkArray = (arr, size) => {
  const length = Math.ceil(arr.length / size);
  return Array.from({ length }, (_, i) => arr.slice(i * size, i * size + size));
};

export default chunkArray;
