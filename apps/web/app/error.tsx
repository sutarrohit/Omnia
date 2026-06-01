"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className='flex flex-1 items-center justify-center p-6'>
      <Card className='w-full max-w-md'>
        <CardHeader className='text-center'>
          <div className='mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10'>
            <AlertCircle strokeWidth={2} className='size-8 text-destructive' />
          </div>
          <CardTitle className='text-xl'>Something went wrong</CardTitle>
          <CardDescription className='text-sm'>
            {error.message || "An unexpected error occurred. Please try again."}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <Button onClick={reset}>
            <RefreshCw strokeWidth={2} className='size-4' />
            Reload
          </Button>
          <Button variant='outline' asChild>
            <Link href='/'>
              <Home strokeWidth={2} className='size-4' />
              Go to Home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
