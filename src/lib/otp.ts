const otpStore = new Map<string, string>();

export function sendOTP(phone: string) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, otp);
  console.log("OTP:", otp);
  return true;
}

export function verifyOTP(phone: string, otp: string) {
  return otpStore.get(phone) === otp;
}
