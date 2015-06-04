#include "Wire.h"

const int RELAY_PIN = 2;
const int CURRENT_PIN = A0;

const byte DS1307_I2C_ADDRESS = 0x68; // DS1307 (I2C) address
const byte NubberOfFields = 7; // DS1307 (I2C) address range

// varible for getting current value
const unsigned long sampleTime = 100000UL;// sample over 100ms, it is an exact number of cycles for both 50Hz and 60Hz mains
const unsigned long numSamples = 250UL;// choose the number of samples to divide sampleTime exactly, but low enough for the ADC to keep up
const unsigned long sampleInterval = sampleTime/numSamples;// the sampling interval, must be longer than then ADC conversion time
const int adc_zero = 511;// relative digital zero of the arudino input from ACS712 (could make this a variable and auto-adjust it)

// varible for RTC
int y; // year
byte m, d, w, h, mi, s; // month, day, week, hour, minute, second

byte bcdTodec(byte val){
    return ((val / 16 * 10) + (val % 16));
}

byte decToBcd(byte val){
    return ((val / 10 * 16) + (val % 10));
}

void setTime(byte y, byte m, byte d, byte w, byte h, byte mi, byte s){
    Wire.beginTransmission(DS1307_I2C_ADDRESS);
    Wire.write(0);
    Wire.write(decToBcd(s));
    Wire.write(decToBcd(mi));
    Wire.write(decToBcd(h));
    Wire.write(decToBcd(w));
    Wire.write(decToBcd(d));
    Wire.write(decToBcd(m));
    Wire.write(decToBcd(y));
    Wire.endTransmission();
}

void getTime(){
    Wire.beginTransmission(DS1307_I2C_ADDRESS);
    Wire.write(0);
    Wire.endTransmission();

    Wire.requestFrom(DS1307_I2C_ADDRESS, NubberOfFields);

    s = bcdTodec(Wire.read() & 0x7f);
    mi = bcdTodec(Wire.read());
    h = bcdTodec(Wire.read() & 0x7f);
    w = bcdTodec(Wire.read());
    d = bcdTodec(Wire.read());
    m = bcdTodec(Wire.read());
    y = bcdTodec(Wire.read()) + 2000;
}

void req4currnet()
{
  long adc_raw;
  unsigned long currentAcc = 0;
  unsigned int count = 0;
  unsigned long prevMicros = micros() - sampleInterval ;
  while (count < numSamples)
  {
    if (micros() - prevMicros >= sampleInterval)
    {
      adc_raw = analogRead(CURRENT_PIN) - adc_zero;
      currentAcc += (unsigned long)(adc_raw * adc_raw);
      count++;
      prevMicros += sampleInterval;
    }
  }
  getTime();
  String time = String(y) + "/" + String(m) + "/" + String(d) + " " + String(h) + ":" + String(mi) + ":" + String(s);  
  float rms = sqrt((float)currentAcc/(float)numSamples) * (27.03 / 1024.0);
  Serial.println(String(rms)+","+String(time));
}


void setup()
{
  Serial.begin(57600);
  
  // relay setup
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
  
  // RTC setup
  Wire.begin();
  setTime(15,6,3,3,22,37,0); // 2015/6/3(wed)22:37:00
}

void loop()
{
  String in = "";
  
  if (Serial.available()) {
    while(true) {
      while (Serial.available() == false) {}
    
      in += (char)Serial.read();

      if(in == "ON") {
        digitalWrite(RELAY_PIN, HIGH);
        break;
      }
      else if(in == "OFF") {
        digitalWrite(RELAY_PIN, LOW);
        break;
      }
      else if(in == "req4data") {
        req4currnet();
        break;
      }
      else if(in.endsWith("\n")) {
        break;
      }
      
    }
  }         
}
