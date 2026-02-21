// Mask utilities for form inputs

export const maskCPF = (value: string): string => {
  const numbers = value.replace(/\D/g, "").slice(0, 11);
  return numbers
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

export const unmaskCPF = (value: string): string => {
  return value.replace(/\D/g, "");
};

export const maskPhone = (value: string): string => {
  const numbers = value.replace(/\D/g, "").slice(0, 11);
  if (numbers.length <= 10) {
    return numbers
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return numbers
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
};

export const unmaskPhone = (value: string): string => {
  return value.replace(/\D/g, "");
};

export const maskPlate = (value: string): string => {
  const cleaned = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 7);
  if (cleaned.length <= 3) {
    return cleaned;
  }
  return cleaned.slice(0, 3) + "-" + cleaned.slice(3);
};

export const unmaskPlate = (value: string): string => {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
};

export const maskRenavam = (value: string): string => {
  return value.replace(/\D/g, "").slice(0, 11);
};

export const maskCNH = (value: string): string => {
  return value.replace(/\D/g, "").slice(0, 11);
};

export const maskYear = (value: string): string => {
  return value.replace(/\D/g, "").slice(0, 4);
};

export const maskOnlyNumbers = (value: string): string => {
  return value.replace(/\D/g, "");
};

export const maskOnlyLettersNumbers = (value: string): string => {
  return value.replace(/[^A-Za-z0-9\s]/g, "");
};

export const maskCNPJ = (value: string): string => {
  const numbers = value.replace(/\D/g, "").slice(0, 14);
  return numbers
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

export const unmaskCNPJ = (value: string): string => {
  return value.replace(/\D/g, "");
};

export const validateCNPJ = (cnpj: string): boolean => {
  const numbers = cnpj.replace(/\D/g, "");
  if (numbers.length !== 14) return false;
  if (/^(\d)\1+$/.test(numbers)) return false;
  
  let size = numbers.length - 2;
  let nums = numbers.substring(0, size);
  const digits = numbers.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(nums.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  
  size = size + 1;
  nums = numbers.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(nums.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  
  return true;
};

// Validation functions
export const validateCPF = (cpf: string): boolean => {
  const numbers = cpf.replace(/\D/g, "");
  if (numbers.length !== 11) return false;
  
  // Check for known invalid patterns
  if (/^(\d)\1+$/.test(numbers)) return false;
  
  // Validate check digits
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(numbers[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(numbers[9])) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(numbers[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(numbers[10])) return false;
  
  return true;
};

export const validatePlate = (plate: string): boolean => {
  const cleaned = plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  // Mercosul format: ABC1D23 or old format: ABC1234
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(cleaned);
};

export const validateRenavam = (renavam: string): boolean => {
  const numbers = renavam.replace(/\D/g, "");
  return numbers.length === 11;
};

export const validateCNH = (cnh: string): boolean => {
  const numbers = cnh.replace(/\D/g, "");
  return numbers.length === 11;
};

export const validatePhone = (phone: string): boolean => {
  const numbers = phone.replace(/\D/g, "");
  return numbers.length >= 10 && numbers.length <= 11;
};

export const maskCEP = (value: string): string => {
  const numbers = value.replace(/\D/g, "").slice(0, 8);
  return numbers.replace(/(\d{5})(\d)/, "$1-$2");
};

export const unmaskCEP = (value: string): string => {
  return value.replace(/\D/g, "");
};
