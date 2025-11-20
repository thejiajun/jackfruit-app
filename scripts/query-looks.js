// 查询 prompt_items 表中 category='looks' 的数据
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://prcztfkqoipcqiwqmwwe.supabase.co'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByY3p0Zmtxb2lwY3Fpd3Ftd3dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA3OTk1MDMsImV4cCI6MjA0NjM3NTUwM30.VtCTHJqYe_rNX3m1m4x3VqCpzYQ3HNmm6H_YUOOe3hQ'

const supabase = createClient(supabaseUrl, supabaseKey)

async function queryLooks() {
  console.log('查询 prompt_items 表中 category=\'looks\' 的数据...\n')

  const { data, error } = await supabase
    .from('prompt_items')
    .select('id, name, prompts, display_order, enabled')
    .eq('category', 'looks')
    .is('deleted_at', null)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('查询错误:', error)
    return
  }

  if (!data || data.length === 0) {
    console.log('没有找到 category=\'looks\' 的数据')
    console.log('\n尝试查询 category=\'looking\' 的数据...\n')

    const { data: lookingData, error: lookingError } = await supabase
      .from('prompt_items')
      .select('id, name, prompts, display_order, enabled')
      .eq('category', 'looking')
      .is('deleted_at', null)
      .order('display_order', { ascending: true })

    if (lookingError) {
      console.error('查询错误:', lookingError)
      return
    }

    console.log(`找到 ${lookingData.length} 条 'looking' 数据:\n`)
    lookingData.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} (ID: ${item.id})`)
      console.log(`   Display Order: ${item.display_order}`)
      console.log(`   Enabled: ${item.enabled}`)
      console.log(`   Prompts:`, JSON.stringify(item.prompts, null, 2))
      console.log('')
    })

    return
  }

  console.log(`找到 ${data.length} 条 'looks' 数据:\n`)
  data.forEach((item, index) => {
    console.log(`${index + 1}. ${item.name} (ID: ${item.id})`)
    console.log(`   Display Order: ${item.display_order}`)
    console.log(`   Enabled: ${item.enabled}`)
    console.log(`   Prompts:`, JSON.stringify(item.prompts, null, 2))
    console.log('')
  })
}

queryLooks()
