import  Link  from 'next/link'
import React from 'react'

function Headers() {
  return (
    <div className='flex justify-between items-center  px-10 py-7 '>
        <h1>Logo</h1>
        <button className='bg-[#a42921] text-[white] py-3 px-6 rounded-full cursor-pointer hover:bg-[#b02015]'>
        <Link href='/auth/signin'>
        Sign In
        </Link>
        </button>
    </div>
  )
  
}

export default Headers
