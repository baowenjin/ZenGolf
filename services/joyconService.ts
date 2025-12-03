import { JoyConData } from '../types';

// Define HIDDevice interface manually as it's not always available in standard lib
interface HIDDevice extends EventTarget {
  opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
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
  private globalPacketNumber = 0;

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
      if (!this.device.opened) {
        await this.device.open();
      }
      this.isConnected = true;

      console.log(`Connected to ${this.device.productName}`);

      // Wait a moment before initializing
      await new Promise(resolve => setTimeout(resolve, 100));
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
    this.globalPacketNumber = 0;

    try {
      console.log("Initializing Joy-Con...");
      // 1. Enable Vibration
      await this.sendSubcommand(0x48, [0x01]);
      
      // 2. Enable IMU (6-Axis Sensor)
      await this.sendSubcommand(0x40, [0x01]);
      
      // 3. Set input report mode to Standard Full (0x30)
      // This is crucial for 60Hz IMU updates
      await this.sendSubcommand(0x03, [0x30]);
      
      console.log("Joy-Con initialization commands sent.");
    } catch (e) {
      console.warn("Failed to initialize Joy-Con modes:", e);
    }
  }

  private async sendSubcommand(command: number, data: number[]) {
    if (!this.device) return;
    
    // Output Report 0x01 structure:
    // Byte 0: Packet Number (0x0 - 0xF)
    // Byte 1-8: Rumble Data (00 01 40 40 00 01 40 40 is neutral-ish, 00s is off)
    // Byte 9: Subcommand ID
    // Byte 10+: Subcommand Data

    const buf = new Uint8Array(10 + data.length);
    
    // Increment packet number (0-15)
    this.globalPacketNumber = (this.globalPacketNumber + 1) & 0xF;
    buf[0] = this.globalPacketNumber;

    // Rumble Data (Left: 00 01 40 40, Right: 00 01 40 40) - Neutral High Frequency
    // Setting all to 0 might ignore vibration but is safe for now.
    buf[1] = 0x00; buf[2] = 0x01; buf[3] = 0x40; buf[4] = 0x40;
    buf[5] = 0x00; buf[6] = 0x01; buf[7] = 0x40; buf[8] = 0x40;
    
    buf[9] = command; // Subcommand ID
    buf.set(data, 10);
    
    // Send to Report ID 0x01
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
    const reportId = data.getUint8(0);
    
    // Create a hex string for debugging
    let rawHex = "";
    for (let i = 0; i < Math.min(data.byteLength, 12); i++) {
        rawHex += data.getUint8(i).toString(16).padStart(2, '0').toUpperCase() + " ";
    }

    // Default empty state
    let buttons: JoyConData['buttons'] = {
      zr: false, zl: false, r: false, l: false,
      a: false, b: false, x: false, y: false,
      plus: false, minus: false, home: false, capture: false,
      up: false, down: false, left: false, right: false,
      stick: false, rStickClick: false, lStickClick: false,
      sl: false, sr: false
    };
    
    let accel = { x: 0, y: 0, z: 0 };
    let gyro = { x: 0, y: 0, z: 0 };
    let stick = { x: 0, y: 0 };

    // Standard Full Mode (0x30)
    if (reportId === 0x30) {
      // IMU Data (Bytes 13-48)
      // Note: DataView offsets are absolute to the view, so check if reportId is included or not.
      // WebHID data usually includes the Report ID at index 0.

      const accelX = data.getInt16(13, true) * 0.000244;
      const accelY = data.getInt16(15, true) * 0.000244;
      const accelZ = data.getInt16(17, true) * 0.000244;

      const gyroX = data.getInt16(19, true) * 0.061;
      const gyroY = data.getInt16(21, true) * 0.061;
      const gyroZ = data.getInt16(23, true) * 0.061;

      accel = { x: accelX, y: accelY, z: accelZ };
      gyro = { x: gyroX, y: gyroY, z: gyroZ };

      // Buttons
      const bRight = data.getUint8(3);
      const bShared = data.getUint8(4);
      const bLeft = data.getUint8(5);

      buttons = {
        // Right Joy-Con (Byte 3)
        y: !!(bRight & 0x01),
        x: !!(bRight & 0x02),
        b: !!(bRight & 0x04),
        a: !!(bRight & 0x08),
        r: !!(bRight & 0x40),
        zr: !!(bRight & 0x80),
        sl: !!(bRight & 0x10), // Technically SL/SR on right joycon
        sr: !!(bRight & 0x20),

        // Shared (Byte 4)
        minus: !!(bShared & 0x01),
        plus: !!(bShared & 0x02),
        rStickClick: !!(bShared & 0x04),
        lStickClick: !!(bShared & 0x08),
        home: !!(bShared & 0x10),
        capture: !!(bShared & 0x20),
        stick: !!(bShared & 0x04) || !!(bShared & 0x08),

        // Left Joy-Con (Byte 5)
        down: !!(bLeft & 0x01),
        up: !!(bLeft & 0x02),
        right: !!(bLeft & 0x04),
        left: !!(bLeft & 0x08),
        l: !!(bLeft & 0x40), 
        zl: !!(bLeft & 0x80),
      };

      // Analog Sticks (12-bit parsing)
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
        stick.x = (rawX - 2048) / 2048;
        stick.y = (rawY - 2048) / 2048;
      }
    } 
    // Handle Simple Mode (0x3F) - Happens before initialization or if init fails
    else if (reportId === 0x3F) {
       // Byte 1: Button Hat 1
       // Byte 2: Button Hat 2
       // This is a minimal fallback to show *some* data
       const b1 = data.getUint8(1);
       const b2 = data.getUint8(2);

       // Simple Mapping (Approximate, varies by single/dual mode)
       buttons.a = !!(b1 & 0x01); // Right
       buttons.x = !!(b1 & 0x02); // Up
       buttons.b = !!(b1 & 0x04); // Down
       buttons.y = !!(b1 & 0x08); // Left
       buttons.sl = !!(b1 & 0x10);
       buttons.sr = !!(b1 & 0x20);
       
       // Force re-init if we are stuck in 0x3F
       if (Math.random() < 0.05) { // Throttle retries
          this.initializeDevice(); 
       }
    }

    if (this.onDataCallback) {
      this.onDataCallback({
        accel,
        gyro,
        stick,
        buttons,
        rawHex
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