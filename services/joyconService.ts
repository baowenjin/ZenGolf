import { JoyConData } from '../types';

// Define HIDDevice interface manually as it's not always available in standard lib
interface HIDDevice extends EventTarget {
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  addEventListener(type: string, listener: (event: any) => void): void;
  productId: number;
  vendorId: number;
  productName: string;
}

// Extend Navigator to include HID
interface NavigatorHID extends Navigator {
  hid: {
    requestDevice(options: { filters: { vendorId: number; productId?: number }[] }): Promise<HIDDevice[]>;
  };
}

// Nintendo Vendor ID
const VENDOR_ID = 0x057e;
// Joy-Con L and R Product IDs
const PRODUCT_IDS = [0x2006, 0x2007];

export class JoyConService {
  private device: HIDDevice | null = null;
  private onDataCallback: ((data: JoyConData) => void) | null = null;
  public isConnected = false;

  constructor() {}

  async connect(): Promise<boolean> {
    try {
      const nav = navigator as unknown as NavigatorHID;
      if (!nav.hid) {
        console.error("WebHID not supported in this browser.");
        return false;
      }

      const devices = await nav.hid.requestDevice({
        filters: PRODUCT_IDS.map(pid => ({ vendorId: VENDOR_ID, productId: pid }))
      });

      if (devices.length === 0) return false;

      this.device = devices[0];
      await this.device.open();
      this.isConnected = true;

      console.log(`Connected to ${this.device.productName}`);

      await this.initializeDevice();
      this.startListening();

      return true;
    } catch (e) {
      console.error("JoyCon Connect Error:", e);
      return false;
    }
  }

  public getDeviceName(): string {
    return this.device?.productName || "No Device";
  }

  private async initializeDevice() {
    if (!this.device) return;

    try {
      // 1. Enable Vibration
      await this.sendSubcommand(0x48, [0x01]);
      
      // 2. Enable IMU (6-Axis Sensor)
      await this.sendSubcommand(0x40, [0x01]);
      
      // 3. Set input report mode to Standard Full (0x30)
      // This is crucial for 60Hz IMU updates
      await this.sendSubcommand(0x03, [0x30]);
      
      console.log("Joy-Con initialized in Standard Full Mode");
    } catch (e) {
      console.warn("Failed to initialize Joy-Con modes:", e);
    }
  }

  private async sendSubcommand(command: number, data: number[]) {
    if (!this.device) return;
    const buf = new Uint8Array(9 + data.length);
    buf[0] = 0x01; // Global packet number?
    buf[1] = 0x00; // Rumble data (empty)
    buf[2] = 0x00;
    buf[3] = 0x00;
    buf[4] = 0x00;
    buf[5] = 0x00;
    buf[6] = 0x00;
    buf[7] = 0x00;
    buf[8] = 0x00;
    buf[9] = command; // Subcommand ID
    buf.set(data, 10);
    await this.device.sendReport(0x01, buf);
  }

  private startListening() {
    if (!this.device) return;

    this.device.addEventListener('inputreport', (event: any) => {
      const { data } = event;
      if (!data) return;
      this.parseInputReport(data);
    });
  }

  private parseInputReport(data: DataView) {
    // Basic parsing for Standard Full Mode (0x30)
    // Offset 0: Report ID
    // Offset 1: Timer
    // Offset 2: Battery
    // Offset 3: Buttons (Right)
    // Offset 4: Buttons (Shared)
    // Offset 5: Buttons (Left)
    // Offset 6-8: Left Stick
    // Offset 9-11: Right Stick
    // Offset 13-48: IMU Data

    const reportId = data.getUint8(0);
    if (reportId !== 0x30) return;

    // IMU Data
    const accelX = data.getInt16(13, true) * 0.000244;
    const accelY = data.getInt16(15, true) * 0.000244;
    const accelZ = data.getInt16(17, true) * 0.000244;

    const gyroX = data.getInt16(19, true) * 0.061;
    const gyroY = data.getInt16(21, true) * 0.061;
    const gyroZ = data.getInt16(23, true) * 0.061;

    // Buttons
    // NOTE: DataView offsets are absolute.
    const bRight = data.getUint8(3);
    const bShared = data.getUint8(4);
    const bLeft = data.getUint8(5);

    const buttons = {
      // Right Joy-Con (Byte 3)
      y: !!(bRight & 0x01),
      x: !!(bRight & 0x02),
      b: !!(bRight & 0x04),
      a: !!(bRight & 0x08),
      r: !!(bRight & 0x40),
      zr: !!(bRight & 0x80),

      // Shared (Byte 4)
      minus: !!(bShared & 0x01),
      plus: !!(bShared & 0x02),
      rStickClick: !!(bShared & 0x04),
      lStickClick: !!(bShared & 0x08),
      home: !!(bShared & 0x10),
      capture: !!(bShared & 0x20),
      stick: !!(bShared & 0x04) || !!(bShared & 0x08), // Generic stick click

      // Left Joy-Con (Byte 5)
      down: !!(bLeft & 0x01),
      up: !!(bLeft & 0x02),
      right: !!(bLeft & 0x04),
      left: !!(bLeft & 0x08),
      l: !!(bLeft & 0x40), 
      zl: !!(bLeft & 0x80),
    };

    // Analog Sticks (12-bit parsing)
    let stickX = 0;
    let stickY = 0;

    const productId = this.device?.productId;

    // Joy-Con L (0x2006) uses bytes 6-8
    // Joy-Con R (0x2007) uses bytes 9-11
    let b0 = 0, b1 = 0, b2 = 0;

    if (productId === 0x2006) {
      b0 = data.getUint8(6);
      b1 = data.getUint8(7);
      b2 = data.getUint8(8);
    } else if (productId === 0x2007) {
      b0 = data.getUint8(9);
      b1 = data.getUint8(10);
      b2 = data.getUint8(11);
    }

    if (b0 || b1 || b2) {
      const rawX = b0 | ((b1 & 0xF) << 8);
      const rawY = ((b1 & 0xF0) >> 4) | (b2 << 4);
      // Normalize approx 0-4095 to -1.0 to 1.0
      stickX = (rawX - 2048) / 2048;
      stickY = (rawY - 2048) / 2048;
    }

    if (this.onDataCallback) {
      this.onDataCallback({
        accel: { x: accelX, y: accelY, z: accelZ },
        gyro: { x: gyroX, y: gyroY, z: gyroZ },
        stick: { x: stickX, y: stickY },
        buttons
      });
    }
  }

  subscribe(cb: (data: JoyConData) => void) {
    this.onDataCallback = cb;
  }

  disconnect() {
    if (this.device) {
      this.device.close();
      this.isConnected = false;
      this.device = null;
    }
  }
}

export const joyConService = new JoyConService();