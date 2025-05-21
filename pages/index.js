import Head from "next/head";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import styles from "@/styles/Home.module.css";
import { useRouter } from "next/router";
import { useState } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {

  const router = useRouter()
  const [channel,setChannel] = useState("")

  const handleJoin = () =>{

    if(channel.trim()){
      router.push(`/call?channel=${channel}`)
    }

  }


  return (
    <>

    <div className={styles.container}>

      <input
        type="text"
        placeholder="Enter channel name"
        className="inp"
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
      />
      <button className="btn" onClick={handleJoin}>Join</button>



    </div>


     
    </>
  );
}
