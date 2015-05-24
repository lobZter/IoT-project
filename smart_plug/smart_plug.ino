unsigned long time = 1432280400;
const int RELAY_PIN = 13;
const int CURRENT_PIN = A0;
const unsigned long sampleTime = 100000UL;// sample over 100ms, it is an exact number of cycles for both 50Hz and 60Hz mains
const unsigned long numSamples = 250UL;// choose the number of samples to divide sampleTime exactly, but low enough for the ADC to keep up
const unsigned long sampleInterval = sampleTime/numSamples;// the sampling interval, must be longer than then ADC conversion time
const int adc_zero = 511;// relative digital zero of the arudino input from ACS712 (could make this a variable and auto-adjust it)

void setup()
{
  Serial.begin(57600);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
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
  float rms = sqrt((float)currentAcc/(float)numSamples) * (27.03 / 1024.0);
  Serial.println(String(rms)+","+String(time));
}

void loop()
{
  time += 1;
  
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
