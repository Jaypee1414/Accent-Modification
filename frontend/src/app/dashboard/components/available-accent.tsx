import React from "react";
import Image from "next/image";
import { useState } from "react";

interface Props {
    start: () => void;
    stop: () => void;
}

function AvailableAccent({start, stop}: Props) {
    const [toggleAudio, setToggleAudio] = useState(false);

    const handleToggleAudio = () => {
        if(!toggleAudio){
            start()
            setToggleAudio((prev) => !prev)
        }else{
            stop()
        }
    }
  return (
    <div className="mb-4 flex flex-col gap-3 justify-center items-center w-full my-10">
      <Image
        src={"/asset/icon/englishAccent.svg"}
        width={150}
        height={150}
        alt="AI accent profile Icon"
        className="rounded-full p-1 border-1 border-[#10416d] cursor-pointer"
        onClick={handleToggleAudio}
      />
      <label htmlFor="">English Accent</label>
    </div>
  );
}

export default AvailableAccent;
