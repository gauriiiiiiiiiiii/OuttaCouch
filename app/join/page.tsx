"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface ReferrerInfo {
  code: string;
  fromUser: {
    id: string;
    displayName: string;
    profilePhotoUrl?: string;
  };
  invitedPhone: string;
  message: string;
}

export default function JoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [referrerInfo, setReferrerInfo] = useState<ReferrerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams?.get("ref");

    if (!code) {
      // No referral code, redirect to normal signup
      router.push("/signup");
      return;
    }

    // Track the referral link click
    const trackClick = async () => {
      try {
        const response = await fetch(`/api/referrals/${code}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error);
        }

        const data = await response.json();
        setReferrerInfo(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid referral code");
        // Still allow signup after error
        setTimeout(() => {
          router.push("/signup");
        }, 3000);
      } finally {
        setLoading(false);
      }
    };

    trackClick();
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="mb-4 text-red-500">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Invalid Referral Link
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-gray-500 text-sm mb-6">
            Redirecting to signup in a moment...
          </p>
          <Link
            href="/signup"
            className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-6 rounded-lg transition"
          >
            Sign Up Now
          </Link>
        </div>
      </div>
    );
  }

  if (!referrerInfo) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="mb-6">
            {referrerInfo.fromUser.profilePhotoUrl ? (
              <img
                src={referrerInfo.fromUser.profilePhotoUrl}
                alt={referrerInfo.fromUser.displayName}
                className="w-20 h-20 rounded-full mx-auto border-4 border-purple-500 object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
                {referrerInfo.fromUser.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            You&apos;re Invited!
          </h1>

          <p className="text-lg text-gray-700 mb-2">
            <span className="font-semibold text-purple-600">
              {referrerInfo.fromUser.displayName}
            </span>{" "}
            invited you to join
          </p>

          <div className="mt-2 mb-6">
            <span className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Outtacouch
            </span>
          </div>

          <p className="text-gray-600 mb-8">
            Connect with friends, discover events, and make memories together.
          </p>
        </div>

        <div className="bg-purple-50 rounded-lg p-4 mb-8 border-l-4 border-purple-500">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-purple-600">Pro tip:</span> You&apos;ll
            automatically connect with {referrerInfo.fromUser.displayName} when you sign up!
          </p>
        </div>

        <Link
          href="/signup"
          className="block w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-lg transition text-center mb-4"
        >
          Sign Up with Email
        </Link>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or continue with</span>
          </div>
        </div>

        <button className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold py-2 px-4 rounded-lg transition mb-3">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <button className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Continue with Facebook
        </button>

        <p className="text-center text-gray-600 text-sm mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-purple-600 hover:text-purple-700 font-semibold">
            Sign in
          </Link>
        </p>
      </div>

      <div className="absolute top-4 left-4 text-purple-600">
        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v4h8v-4zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
      </div>
    </div>
  );
}
