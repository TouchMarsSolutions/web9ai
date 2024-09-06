fun sumArray(numbers: Array<Int>): Int {
    return numbers.sum()
}

fun main() {
    // Example usage
    val exampleArray = arrayOf(1, 2, 3, 4, 5)
    val result = sumArray(exampleArray)
    
    println("数组的总和是：$result")
}
