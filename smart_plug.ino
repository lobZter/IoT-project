const int RELAY_PIN = 10;
const int CURRENT_PIN = A0;
const unsigned long sampleTime = 100000UL;// sample over 100ms, it is an exact number of cycles for both 50Hz and 60Hz mains
const unsigned long numSamples = 250UL;// choose the number of samples to divide sampleTime exactly, but low enough for the ADC to keep up
const unsigned long sampleInterval = sampleTime/numSamples;// the sampling interval, must be longer than then ADC conversion time
const int adc_zero = 511;// relative digital zero of the arudino input from ACS712 (could make this a variable and auto-adjust it)
unsigned long time = 1431453600000;

void setup()
{
  Serial.begin(57600);
}

void loop()
{
  delay(10000);
  time += 10000;
  
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
      ++count;
      prevMicros += sampleInterval;
    }
  }
  float rms = sqrt((float)currentAcc/(float)numSamples) * (27.03 / 1024.0);
  float power = rms*110/0.7; // assume voltage 110v
  
  
  Serial.println("POST /data HTTP/1.1");
  Serial.println("Content-Type: application/x-www-form-urlencoded;");
  int len = 18 + String(rms).length() + String(time).length();
  Serial.println("Content-Length: "+String(len));
  Serial.println("");
  Serial.println("current="+String(rms)+"&="+String(time));

}
