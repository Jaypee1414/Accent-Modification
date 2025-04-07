import React from "react";
import { MoveUpRight } from "lucide-react";
function Hero() {
  return (
    <div className="flex items-center my-32 flex-col gap-7 w-full justify-between">
      <h1 className="text-5xl md:text-5xl lg:text-6xl xl:text-7xl  text-center text-black">
        Speak Naturally. Sound Globally.
      </h1>
      <h4 className="text-center text-gray-600 text-md md:text-2xl w-[80%] md:w-[50%]">
        Break language barriers with real-time accent transformation and
        intelligent voice clarity — powered by AI.
      </h4>
      <button className="cursor-pointer bg-black text-white py-3 px-4 rounded-full flex items-center gap-3 hover:bg-[#121212]">
        Get Started{" "}
        <div className="bg-red-800 p-2 rounded-full">
          <MoveUpRight />
        </div>{" "}
      </button>
    </div>
  );
}

export default Hero;
