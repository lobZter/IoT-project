#include <pt.h>   // include protothread library

static struct pt pt1, pt2; // each protothread needs one of these

const int RELAY_PIN = 13;
const int CURRENT_PIN = A0;
boolean ONorOFF = true;

const unsigned long sampleTime = 100000UL;// sample over 100ms, it is an exact number of cycles for both 50Hz and 60Hz mains
const unsigned long numSamples = 250UL;// choose the number of samples to divide sampleTime exactly, but low enough for the ADC to keep up
const unsigned long sampleInterval = sampleTime/numSamples;// the sampling interval, must be longer than then ADC conversion time
const int adc_zero = 511;// relative digital zero of the arudino input from ACS712 (could make this a variable and auto-adjust it)
unsigned long time = 1432280400;

void setup()
{
  Serial.begin(57600);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
  PT_INIT(&pt1);  // initialise the two
  PT_INIT(&pt2);  // protothread variables
}

static int protothread1(struct pt *pt) {

  PT_BEGIN(pt);
  while(1) {

    time += 10;
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
    float rms = sqrt((float)currentAcc/(float)numSamples) * (27.03 / 1024.0);
    float power = rms*110/0.7; // assume voltage 110v


    Serial.println("POST 140.113.65.29:55556/data HTTP/1.1");
    Serial.println("Content-Type: application/x-www-form-urlencoded");
    int len = 18 + String(rms).length() + String(time).length();
    Serial.println("Content-Length: "+String(len));
    Serial.println("");
    Serial.println("current="+String(rms)+"&datetime="+String(time));

    delay(10000);
  }
  PT_END(pt);
}

static int protothread2(struct pt *pt) {

  PT_BEGIN(pt);
  while(1) {
    boolean has_request = false;
    String in = "";

    if (Serial.available()) {
      in = "";
      while(true) {  // should add time out here
        while (Serial.available() == false) {}

        in += (char)Serial.read();
        if (in.endsWith("\r\n\r\n")) {
          has_request = true;  break;
        }
      }
    }
    if (has_request) {
      int i1 = in.indexOf("GET /trigger?ONorOFF=");
      int i2;
      if (i1 != -1) {
        i2 = in.indexOf(" ", i1+21);
        ONorOFF = (boolean)(in.substring(i1+13, i2).toInt());
        if (ONorOFF)  digitalWrite(RELAY_PIN, HIGH);
        else          digitalWrite(RELAY_PIN, LOW);
      }
    }
  }
  PT_END(pt);
}

void loop() {
  protothread1(&pt1);
  protothread2(&pt2);
}
