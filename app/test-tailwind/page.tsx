export default function TestTailwindPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="text-center space-y-8">
        <h1 className="text-6xl font-bold text-red-600">
          טקסט אדום גדול
        </h1>
        <p className="text-2xl text-blue-500 font-semibold">
          כחול בינוני
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
            כפתור ירוק
          </button>
          <button className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors">
            כפתור סגול
          </button>
        </div>
        <div className="mt-8 p-6 bg-white rounded-xl shadow-lg border-2 border-orange-400">
          <p className="text-xl text-gray-700">
            אם אתה רואה צבעים, עיגולים וצללים - Tailwind עובד! 🎉
          </p>
        </div>
      </div>
    </div>
  )
}
