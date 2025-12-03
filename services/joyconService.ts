import { JoyConData } from '../types';

// Define HIDDevice interface manually as it's not always available in standard lib
interface HIDDevice extends EventTarget {
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  addEventListener(type: string, listener: (event: any) => void): void;
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
  private isConnected = false;

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

      await this.initializeDevice();
      this.startListening();

      return true;
    } catch (e) {
      console.error("JoyCon Connect Error:", e);
      return false;
    }
  }

  private async initializeDevice() {
    if (!this.device) return;

    try {
      // Enable vibration (needed to wake up some modes)
      await this.sendSubcommand(0x48, [0x01]);
      // Enable IMU (6-Axis Sensor)
      await this.sendSubcommand(0x40, [0x01]);
      // Set input report mode to Standard Full (0x30) - 60Hz IMU updates
      await this.sendSubcommand(0x03, [0x30]);
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
    // Byte 0: Report ID
    // Byte 1-12: Button status etc.
    // Byte 13-48: IMU Data (3 frames of 12 bytes each: AccelX, Y, Z, GyroX, Y, Z)

    // Simplified: Just read the first frame of IMU data for responsiveness
    // In a real pro app we would fuse all 3 frames.

    const reportId = data.getUint8(0);
    if (reportId !== 0x30) return;

    const accelX = data.getInt16(13, true) * 0.000244; // Scale factors approx
    const accelY = data.getInt16(15, true) * 0.000244;
    const accelZ = data.getInt16(17, true) * 0.000244;

    const gyroX = data.getInt16(19, true) * 0.061;
    const gyroY = data.getInt16(21, true) * 0.061;
    const gyroZ = data.getInt16(23, true) * 0.061;

    // Buttons (simplified map)
    const byte1 = data.getUint8(1);
    const byte2 = data.getUint8(2);
    const byte3 = data.getUint8(3);

    const buttons = {
      y: !!(byte1 & 0x01),
      x: !!(byte1 & 0x02),
      b: !!(byte1 & 0x04),
      a: !!(byte1 & 0x08),
      r: !!(byte3 & 0x40),
      zr: !!(byte3 & 0x80),
      l: !!(byte3 & 0x40), // Shared bit location depends on L/R controller, simplified here
      zl: !!(byte3 & 0x80),
    };

    if (this.onDataCallback) {
      this.onDataCallback({
        accel: { x: accelX, y: accelY, z: accelZ },
        gyro: { x: gyroX, y: gyroY, z: gyroZ },
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