import React from 'react'

function Headers() {
  return (
    <div className='flex justify-between items-center bg-[#1a1a1a] px-10 py-7 border-b border-black '>
        <h1>Logo</h1>
        <button className='bg-[#ededed] text-[#1a1a1a] py-3 px-6 rounded-full cursor-pointer hover:bg-white'>Signin</button>
    </div>
  )
}

export default Headers
